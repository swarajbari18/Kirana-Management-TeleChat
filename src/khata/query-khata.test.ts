import { describe, expect, it, vi, beforeEach } from "vitest";
import { queryKhata } from "./tools/query-khata.js";
import { ClarificationError } from "./errors.js";
import { followingKhataToolKind } from "./agent-state.js";
import type { ToolExecutionPlanContext } from "../capability-registry/capability-blueprint.js";

vi.mock(
  "../store-durable-object/persistence/repositories/khata-repository.js",
  async (importOriginal) => {
    const actual = await importOriginal<
      typeof import("../store-durable-object/persistence/repositories/khata-repository.js")
    >();
    return {
      ...actual,
      searchCustomersExact: vi.fn(),
      searchSimilarCustomers: vi.fn(),
    };
  },
);

import {
  searchCustomersExact,
  searchSimilarCustomers,
} from "../store-durable-object/persistence/repositories/khata-repository.js";

const mockedExact = vi.mocked(searchCustomersExact);
const mockedSimilar = vi.mocked(searchSimilarCustomers);

const ramesh = {
  id: "c1",
  canonicalName: "Ramesh",
  normalizedName: "ramesh",
  aliases: [],
  createdAt: "now",
  updatedAt: "now",
};

function planContext(
  ordered: Array<{
    operationId: string;
    toolName: string;
    parameters?: Record<string, unknown>;
  }>,
  currentOperationId: string,
): ToolExecutionPlanContext {
  return {
    orderedOperations: ordered.map((op) => ({
      operationId: op.operationId,
      operationDescription: op.toolName,
      toolName: op.toolName,
      parameters: op.parameters ?? {},
      dependencies: [],
    })),
    currentOperationId,
  };
}

const priorEmpty = {
  byOperationId: new Map(),
  byToolName: new Map(),
};

describe("followingKhataToolKind", () => {
  it("detects create_customer even when it is not the immediate next step", () => {
    const kind = followingKhataToolKind(
      [
        { operationId: "q1", toolName: "query_khata" },
        {
          operationId: "m1",
          toolName: "manage_khata_transaction",
          parameters: { operation: "record_manual_credit" },
        },
        {
          operationId: "c1",
          toolName: "manage_khata_transaction",
          parameters: { operation: "create_customer" },
        },
      ],
      "q1",
    );
    expect(kind).toBe("create_customer");
  });

  it("prefers create_customer over later credit when both follow", () => {
    const kind = followingKhataToolKind(
      [
        { operationId: "q1", toolName: "query_khata" },
        {
          operationId: "c1",
          toolName: "manage_khata_transaction",
          parameters: { operation: "create_customer" },
        },
        {
          operationId: "m1",
          toolName: "manage_khata_transaction",
          parameters: { operation: "record_manual_credit" },
        },
      ],
      "q1",
    );
    expect(kind).toBe("create_customer");
  });
});

describe("queryKhata zero-match behavior", () => {
  const db = {} as import("../store-durable-object/persistence/db.js").StoreDatabase;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws clarification when manual credit follows with no exact match", async () => {
    mockedExact.mockResolvedValue([]);
    mockedSimilar.mockResolvedValue([]);

    await expect(
      queryKhata(
        db,
        { customer_name: "Ramesh" },
        priorEmpty,
        planContext(
          [
            { operationId: "q1", toolName: "query_khata" },
            {
              operationId: "m1",
              toolName: "manage_khata_transaction",
              parameters: { operation: "record_manual_credit" },
            },
          ],
          "q1",
        ),
      ),
    ).rejects.toBeInstanceOf(ClarificationError);
  });

  it("continues for create_customer path with similarCandidates in agentState only", async () => {
    mockedExact.mockResolvedValue([]);
    mockedSimilar.mockResolvedValue([{ ...ramesh, score: 0.8 }]);

    const result = await queryKhata(
      db,
      { customer_name: "Ramesh" },
      priorEmpty,
      planContext(
        [
          { operationId: "q1", toolName: "query_khata" },
          {
            operationId: "c1",
            toolName: "manage_khata_transaction",
            parameters: { operation: "create_customer" },
          },
        ],
        "q1",
      ),
    );

    expect(result.agentState.exactMatchCount).toBe(0);
    expect(result.agentState.similarCandidates).toBeDefined();
    expect(result.verifiedFacts).not.toHaveProperty("similarCandidates");
    expect(result.verifiedFacts.found).toBe(false);
  });

  it("continues when create_customer is not immediately after query", async () => {
    mockedExact.mockResolvedValue([]);
    mockedSimilar.mockResolvedValue([]);

    const result = await queryKhata(
      db,
      { customer_name: "New Person" },
      priorEmpty,
      planContext(
        [
          { operationId: "q1", toolName: "query_khata" },
          {
            operationId: "m1",
            toolName: "manage_khata_transaction",
            parameters: { operation: "record_manual_credit" },
          },
          {
            operationId: "c1",
            toolName: "manage_khata_transaction",
            parameters: { operation: "create_customer" },
          },
        ],
        "q1",
      ),
    );

    expect(result.agentState.exactMatchCount).toBe(0);
    expect(result.verifiedFacts.found).toBe(false);
  });

  it("standalone not-found keeps similarCandidates out of verifiedFacts", async () => {
    mockedExact.mockResolvedValue([]);
    mockedSimilar.mockResolvedValue([{ ...ramesh, score: 0.7 }]);

    const result = await queryKhata(
      db,
      { customer_name: "Ramsh" },
      priorEmpty,
      planContext([{ operationId: "q1", toolName: "query_khata" }], "q1"),
    );

    expect(result.verifiedFacts).toEqual({
      exactMatchCount: 0,
      customer_name: "Ramsh",
      found: false,
    });
    expect(result.verifiedFacts).not.toHaveProperty("similarCandidates");
    expect(result.agentState.similarCandidates?.length).toBeGreaterThan(0);
  });
});
