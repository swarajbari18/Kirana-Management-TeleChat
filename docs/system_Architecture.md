# 1. System Overview

## Purpose

The objective of this system is not merely to implement a Telegram chatbot for a kirana store.

The objective is to build an **AI-driven business operating system** capable of understanding business intent, reasoning about the appropriate business operations, executing those operations while preserving business correctness, and communicating naturally with the owner.

The conversational interface is simply the interaction medium.

The product itself is the business operating system that exists behind that interface.

The architecture is intentionally designed so that conversational intelligence, business correctness and business persistence remain independent concerns with clearly defined ownership boundaries.

---



## Engineering Problem

The owner communicates using natural language.

Natural language is inherently ambiguous, incomplete and conversational.

Business systems, however, require deterministic, auditable and consistent execution.

The primary engineering problem solved by this architecture is therefore:

> **How do we safely transform ambiguous human conversation into deterministic business operations without allowing the language model to become the source of business truth?**

This question drives every architectural decision made throughout the system.

---



## Architectural Philosophy

The system follows an **Agent-First Business Architecture**.

The language model is responsible for reasoning.

The software system is responsible for correctness.

Instead of treating the LLM as the application, the LLM is treated as one component within a larger software architecture.

The application itself remains a traditional software system composed of independent responsibility-owning subsystems.

The language model provides adaptive reasoning where deterministic software alone would be insufficient.

Everything else remains deterministic software engineering.

---



## Core Architectural Flow

Every request follows the same conceptual transformation.

```text
Natural Language

↓

Business Intent

↓

Business Capability

↓

Business Operation

↓

Business State

↓

Business Result

↓

Natural Language Response
```

This flow represents the backbone of the architecture.

Every subsystem exists to support one or more stages of this transformation.

No subsystem bypasses this pipeline.

---



## Separation of Responsibilities

The architecture deliberately separates five fundamentally different concerns.

### Conversation

Responsible for understanding the owner's ongoing conversation.

Owns:

- conversational continuity
- references
- clarification context
- active draft references

Conversation never becomes business truth.

---



### Reasoning

Responsible for interpreting the owner's intent and planning execution.

Owns:

- business intent identification
- execution planning
- capability selection
- workflow coordination
- response generation

Reasoning never performs business operations.

---



### Business Execution

Responsible for deterministic business behaviour.

Owns:

- business rules
- validation
- invariant preservation
- business operations

Business execution never performs conversational reasoning.

---



### Business Truth

Responsible for durable business knowledge.

Owns:

- inventory
- bills
- customer credit
- preferences
- business history

Business truth survives conversation resets, process restarts and runtime failures.

---



### Infrastructure

Responsible for enabling execution.

Owns:

- runtime lifecycle
- execution coordination
- persistence mechanisms
- document generation
- communication with external systems

Infrastructure never owns business policy.

---



## Architectural Principles

The following principles govern every subsystem within the architecture.

### Business Intent is the central abstraction.

The owner never requests database operations or API calls.

The owner expresses a business objective.

The architecture exists to transform business intent into business operations.

---



### Business Capabilities own correctness.

Every business invariant has exactly one owner.

Inventory correctness belongs to the Inventory Capability.

Billing correctness belongs to the Billing Capability.

Khata correctness belongs to the Khata Capability.

No subsystem is permitted to enforce another subsystem's invariants.

---



### The LLM reasons but never owns business truth.

The language model may:

- understand language
- infer intent
- plan execution
- coordinate capabilities

The language model may never:

- mutate business state directly
- calculate financial correctness
- enforce inventory rules
- determine business truth

---



### Tools represent business operations.

Every tool exposed to the language model corresponds to a complete business operation.

Tools never expose database mutations.

Examples of valid business operations include:

- Receive Stock
- Modify Draft Bill
- Finalize Bill
- Record Khata Payment
- Generate Weekly Analysis

Examples of invalid tool design include:

- Update Inventory Row
- Insert Bill Item
- Delete Ledger Record

Business operations encapsulate the complete business workflow required to satisfy a business objective.

---



### Business correctness is deterministic.

Business correctness is established exclusively through deterministic software.

The language model may request execution.

Business capabilities determine whether execution is valid.

---



### Conversation is temporary.

Conversation exists only to support reasoning.

Conversation is never treated as authoritative business memory.

Durable business state always takes precedence over conversational context.

---



### Runtime behaviour is iterative.

The runtime is not a workflow graph.

The runtime repeatedly performs the following cycle:

Observe

↓

Identify Business Intent

↓

Reason

↓

Select Business Capability

↓

Execute Business Operation

↓

Observe Updated State

↓

Determine Whether the Business Objective Has Been Satisfied

↓

Repeat if Necessary

The system therefore adapts to runtime conditions instead of traversing predefined execution paths.

---



## Runtime Boundary

The system executes within a single runtime boundary representing one kirana store.

The runtime boundary contains:

- execution state
- conversation state
- business capabilities
- orchestration
- persistence

The runtime boundary intentionally aligns with the business boundary.

One store represents one consistent business world.

This allows every business operation within that store to execute against a single authoritative source of truth.

---



## High-Level Software Architecture

```text
Telegram

↓

Worker & Telegram Adapter

↓

Store Runtime

    ├── Execution Manager
    ├── Conversation Manager
    ├── Global Orchestrator
    ├── Capability Registry
    │
    ├── Product Capability
    ├── Inventory Capability
    ├── Billing Capability
    ├── Khata Capability
    ├── Analytics Capability
    ├── Configuration Capability
    │
    ├── Persistence
    └── Artifact Generation

↓

Gemini
```

This diagram illustrates the primary software components.

Each component owns a well-defined responsibility and communicates with neighbouring components through explicit interfaces.

No component bypasses another component's ownership boundary.

The remainder of this document specifies each of these components in detail, including their responsibilities, interfaces, internal architecture, business rules, failure behaviour, observability, testing strategy, acceptance criteria and end-to-end validation approach.

# 2. Worker & Telegram Adapter



## Purpose

The Worker & Telegram Adapter is the system's transport boundary.

Its sole responsibility is to translate external Telegram communication into an internal application request and translate the application's response back into the Telegram Bot API.

It is intentionally designed to remain thin. It contains no business logic, performs no business reasoning, owns no business state, and makes no business decisions.

This separation ensures that changes to the transport layer never affect business behaviour.

---



## Why this component exists

Telegram communicates using HTTP webhooks and Telegram-specific update payloads.

The rest of the application should never depend on Telegram's protocol or data structures.

This component isolates all Telegram-specific concerns into one subsystem so that the remainder of the application operates purely in terms of business requests.

---



## Responsibilities

This component is responsible for:

- Receiving incoming Telegram webhook requests.
- Validating incoming webhook requests.
- Parsing Telegram Update objects.
- Extracting the business identity (Store ID / User ID).
- Resolving the correct Cloudflare Durable Object.
- Creating an application request.
- Forwarding the request to the Durable Object.
- Returning the application's response back to Telegram.

This component is explicitly **not** responsible for:

- Business intent identification.
- Conversation management.
- Business rule validation.
- Tool selection.
- LLM interaction.
- Inventory management.
- Billing.
- Khata.
- Persistence.
- Document generation.

---



## Internal Architecture

```text
Telegram

↓

Worker

├── Webhook Handler
├── Update Parser
├── Identity Resolver
├── Durable Object Resolver
└── Request Dispatcher

↓

Durable Object
```

---



## Internal Components



### Webhook Handler

Responsible for:

- Receiving HTTP requests.
- Validating request format.
- Returning appropriate HTTP responses.
- Rejecting malformed requests.

---



### Update Parser

Responsible for:

- Parsing Telegram Update objects.
- Identifying update type.
- Extracting message metadata.
- Extracting user information.
- Extracting chat information.

The parser does not interpret business meaning.

---



### Identity Resolver

Responsible for determining which business instance owns the incoming request.

Input:

- Telegram Update

Output:

- Store Identifier

The mapping strategy must remain deterministic so that every request belonging to the same store resolves to the same Durable Object.

---



### Durable Object Resolver

Responsible for locating the correct Durable Object instance using the resolved Store Identifier.

The Worker never stores business state.

The Durable Object becomes the authoritative execution boundary.

---



### Request Dispatcher

Responsible for forwarding the normalized application request to the resolved Durable Object and returning its response unchanged.

---



## Public Interface



### Input

Telegram Update

### Output

Application Request

The Worker performs protocol translation only.

---



## Internal Workflow

```text
Receive Telegram Update

↓

Validate Request

↓

Parse Update

↓

Resolve Store Identity

↓

Resolve Durable Object

↓

Forward Request

↓

Receive Response

↓

Return Response to Telegram
```

---



## Dependencies



### Depends On

- Telegram Bot API
- Cloudflare Workers Runtime
- Cloudflare Durable Objects



### Used By

- Telegram



### Forwards To

- Execution Manager (inside the Durable Object)

---



## Runtime Rules

The Worker must always remain stateless.

The Worker must never cache business state.

The Worker must never perform business reasoning.

The Worker must never directly invoke business capabilities.

Every request must be routed through the resolved Durable Object.

All transport-specific concerns terminate at this boundary.

---



## Failure Cases



### Invalid Webhook Request

Reject request with appropriate HTTP response.

No request is forwarded.

---



### Unsupported Telegram Update Type

Ignore the update safely.

Return a successful acknowledgement if appropriate to prevent unnecessary retries.

---



### Unable to Resolve Store Identity

Reject request.

Emit structured error log.

Do not invoke the Durable Object.

---



### Durable Object Resolution Failure

Return service failure.

Emit infrastructure error.

Do not retry locally.

---



### Durable Object Invocation Failure

Return service failure.

Emit structured runtime event.

Allow Cloudflare/Telegram retry behaviour according to transport semantics.

---



## Observability

Every request must emit structured transport logs containing:

- Correlation ID
- Telegram Update ID
- Chat ID
- Store ID
- Worker Request ID
- Durable Object ID
- Processing Duration
- Result Status

No business events are logged here.

Business logging belongs to downstream components.

---



## Test Strategy



### Unit Tests

- Update parsing.
- Identity resolution.
- Durable Object resolution.
- Request normalization.
- Error handling.



### Integration Tests

- Telegram webhook reaches Worker.
- Worker resolves correct Durable Object.
- Worker forwards normalized request.
- Worker returns application response.



### Cloud Validation

Deploy to Cloudflare.

Configure Telegram webhook.

Send real Telegram messages.

Verify:

- Webhook invocation.
- Correct Durable Object routing.
- Correct request forwarding.
- Correct response delivery.
- Structured transport logs.

---



## Acceptance Criteria

This component is complete when:

- Every supported Telegram update is parsed correctly.
- Requests are consistently routed to the correct Durable Object.
- The Worker remains completely stateless.
- No business logic exists within the Worker.
- Transport failures are handled safely.
- Structured transport logs are generated for every request.
- Live Telegram communication functions correctly after deployment.



# 3. Store Durable Object



## Purpose

The Store Durable Object is the technical execution boundary of the application.

Every kirana store is represented by exactly one Durable Object instance.

That Durable Object contains the complete software system required to operate that store, including execution coordination, conversation management, orchestration, business capabilities, persistence and document generation.

The Durable Object provides a single authoritative execution environment for one business.

---



## Why this architecture was chosen

The application's most important engineering requirement is preserving business correctness.

Operations such as billing, inventory updates, khata management and preference storage all modify the same business state.

Allowing these operations to execute concurrently across multiple independent processes introduces race conditions, inconsistent inventory and complex distributed coordination.

Cloudflare Durable Objects naturally solve this problem by providing a single execution environment for one business identity.

Instead of coordinating multiple servers and a shared database, all requests belonging to one store are executed inside one Durable Object.

This allows the software architecture to follow the business boundary instead of the infrastructure boundary.

One business.

One execution environment.

One authoritative business state.

---



## Identity Model

Every kirana store owns exactly one Durable Object.

```text
Store

↓

Store Identifier

↓

Cloudflare Durable Object

↓

Application Components

```

The Worker resolves the Store Identifier and forwards every request belonging to that store to the same Durable Object.

This mapping is deterministic.

Regardless of when or where the request originates, the same Store Identifier always resolves to the same Durable Object.

---



## Internal Component Composition

The Durable Object hosts the complete application.

```text
Store Durable Object

├── Execution Manager
├── Conversation Manager
├── Global Orchestrator
├── Capability Registry

├── Product Capability
├── Inventory Capability
├── Billing Capability
├── Khata Capability
├── Analytics Capability
├── Configuration Capability

├── Persistence Layer
└── Artifact Generation

```

These components execute inside the same runtime and operate over the same persistent business state.

The Durable Object itself contains no business logic.

Its responsibility is to provide the execution environment in which these components operate.

---



## State Ownership

The Durable Object owns the lifetime of all application state associated with one store.

This includes:

### Business State

Persistent business information.

Examples:

- Products
- Inventory
- Bills
- Khata
- Owner preferences
- Historical transactions

---



### Conversation State

Temporary conversational information.

Examples:

- Current clarification
- Active draft bill
- Conversation context
- Pending user decisions

Conversation state supports reasoning only and is never considered business truth.

---



### Execution State

Runtime coordination information.

Examples:

- Active request context
- Correlation identifiers
- Transport metadata
- Request lifecycle information
- Runtime execution metadata

Execution state exists only to coordinate request execution.

---



## SQLite Architecture

Each Durable Object owns one private SQLite database.

That database is the authoritative persistence mechanism for the store.

All application components interact with business data through the Persistence Layer.

No component accesses SQLite directly.

This centralizes transaction management, repository logic and persistence concerns.

---



## Execution Model

Every request entering the Durable Object follows the same lifecycle.

```text
Worker

↓

Store Durable Object

↓

Execution Manager

↓

Conversation Manager

↓

Global Orchestrator

↓

Business Capability

↓

Persistence Layer

↓

Business Result

↓

Worker

```

Every request entering the Durable Object shares the same execution environment and therefore observes the latest committed business state.

---



## Communication Rules

The Durable Object defines the communication boundary for the application.

Rules:

- External requests enter only through the Worker.
- Internal components communicate only through defined interfaces.
- Business capabilities never communicate directly with Telegram.
- Business capabilities never invoke external services directly.
- SQLite is accessed only through the Persistence Layer.
- The Durable Object is the only execution boundary for one store.

---



## Failure Model

The Durable Object must preserve business correctness during failures.

Failures may occur due to:

- unexpected runtime exceptions
- persistence failures
- external API failures
- orchestration failures
- timeout conditions

Regardless of failure type:

- partially completed business operations must never become committed business truth
- the execution environment must remain internally consistent
- failures must propagate back through the Execution Manager
- subsequent requests must continue observing a consistent business state

---



## Observability

The Durable Object represents the primary operational boundary of the application.

Operational telemetry should include:

- Durable Object identifier
- Store identifier
- Active execution count
- Execution duration
- Runtime failures
- Component participation
- Persistence latency
- External API latency

Business events are emitted by the owning business capability.

Runtime events are emitted by the Durable Object execution environment.

---



## Test Strategy

This component is validated independently of individual business capabilities.

Testing focuses on runtime behaviour.

Validation includes:

- Correct Durable Object resolution
- Persistent state across requests
- SQLite persistence
- Component initialization
- Runtime recovery after restart
- Correct request routing inside the Durable Object

Business correctness is validated within the individual business capabilities.

---



## Acceptance Criteria

The Store Durable Object is complete when:

- Every request for the same store reaches the same Durable Object.
- Application state persists across requests.
- SQLite remains authoritative for business state.
- Internal components execute within a shared runtime.
- Runtime failures do not corrupt business state.
- All application components initialize successfully.
- The Worker communicates exclusively through the Durable Object boundary.

---



## End-to-End Validation

Deploy the application to Cloudflare.

Verify that:

- Multiple Telegram messages for the same store consistently resolve to the same Durable Object.
- Conversation context survives multiple interactions.
- Business state persists independently of conversation history.
- Runtime recovery preserves business state.
- Structured runtime telemetry is generated for every execution.
- All internal components remain reachable through the Durable Object execution boundary.



# 4. Execution Manager



## Purpose

The Execution Manager is the runtime kernel of the application.

It owns the complete lifecycle of every incoming request.

Every request entering the Store Durable Object must pass through the Execution Manager before any other subsystem is allowed to participate.

The Execution Manager is responsible for creating a safe, observable and deterministic execution environment in which business reasoning and business execution can occur.

It never performs business reasoning and never implements business rules.

Its responsibility is to ensure that every execution follows the application's runtime contract.

---



## Why this component exists

Multiple requests may arrive at different times, originate from different transports and require different business capabilities.

Regardless of the request itself, every execution must satisfy the same runtime guarantees.

Those guarantees include:

- deterministic execution
- execution isolation
- request traceability
- runtime observability
- controlled failure propagation
- execution lifecycle management

Rather than requiring every subsystem to implement these concerns independently, they are centralized inside the Execution Manager.

This keeps runtime concerns independent from business concerns.

---



## Responsibilities

The Execution Manager is responsible for:

- Creating execution contexts.
- Managing the execution lifecycle.
- Assigning correlation identifiers.
- Managing transport metadata.
- Coordinating request execution.
- Maintaining execution state.
- Controlling runtime transitions.
- Coordinating execution completion.
- Propagating failures.
- Producing runtime telemetry.

The Execution Manager is explicitly **not** responsible for:

- Understanding natural language.
- Identifying business intent.
- Selecting business capabilities.
- Applying business rules.
- Performing business operations.
- Accessing business persistence directly.

---



## Internal Architecture

```text
Incoming Request

↓

Execution Context Builder

↓

Execution Lifecycle Controller

↓

Execution State

↓

Global Orchestrator

↓

Execution Completion

↓

Response

```

---



## Internal Components



### Execution Context Builder

Creates a new execution context for every incoming request.

The execution context becomes the authoritative runtime object shared by all participating components.

It contains:

- correlation identifier
- transport metadata
- store identifier
- execution timestamp
- execution status
- runtime metadata

No business information is stored here.

---



### Execution Lifecycle Controller

Controls the execution from creation until completion.

It is responsible for:

- starting execution
- monitoring execution
- detecting completion
- detecting failure
- closing execution

The lifecycle controller owns execution transitions.

No other subsystem may modify execution state directly.

---



### Execution State Manager

Maintains temporary runtime state throughout execution.

Examples include:

- execution status
- participating components
- runtime metadata
- execution timing
- request tracing

Execution state exists only while the request is active.

---



### Runtime Event Publisher

Produces structured runtime events describing execution behaviour.

These events are consumed by observability systems and never participate in business execution.

---



## Public Interface

Input:

Application Request

Output:

Execution Result

The Execution Manager never exposes internal execution structures outside the Store Durable Object.

---



## Internal Workflow

```text
Receive Application Request

↓

Create Execution Context

↓

Initialize Runtime State

↓

Invoke Global Orchestrator

↓

Monitor Execution

↓

Collect Runtime Events

↓

Complete Execution

↓

Return Execution Result

```

---



## Dependencies

Depends upon:

- Conversation Manager
- Global Orchestrator
- Runtime Event Publisher

Used by:

- Worker & Telegram Adapter

The Execution Manager communicates with business capabilities only through the Global Orchestrator.

---



## Runtime Rules

Every execution must satisfy the following rules.

- Every request creates exactly one execution context.
- Every execution receives a unique correlation identifier.
- Execution state exists only during request execution.
- All runtime events belong to exactly one execution context.
- Execution completes in exactly one terminal state.
- No subsystem bypasses the Execution Manager.
- Every request entering the application passes through the Execution Manager.

---



## Failure Cases



### Execution Context Creation Failure

Execution terminates immediately.

No downstream component is invoked.

---



### Runtime Initialization Failure

Execution terminates.

A structured runtime failure event is emitted.

---



### Unexpected Component Failure

Execution enters controlled failure handling.

The failure is propagated upward.

Runtime telemetry is preserved.

---



### Execution Timeout

Execution terminates safely.

The timeout is recorded as a runtime event.

No incomplete execution remains active.

---



### Unexpected Runtime Exception

Execution enters failure handling.

Execution context is finalized.

Runtime events remain available for diagnosis.

---



## Observability

Every execution generates structured runtime telemetry.

Telemetry includes:

- Correlation ID
- Store ID
- Telegram Update ID
- Execution Start Time
- Execution End Time
- Execution Duration
- Participating Components
- Terminal State
- Failure Reason
- Runtime Events

Business events are intentionally excluded from this component.

---



## Test Strategy



### Unit Tests

- Execution context creation
- Lifecycle transitions
- Correlation identifier generation
- Runtime state management
- Runtime event generation
- Failure propagation

---



### Integration Tests

- Worker invokes Execution Manager.
- Execution Manager invokes Global Orchestrator.
- Runtime telemetry is generated.
- Execution completes correctly.
- Failures propagate through controlled paths.

---



### Cloud Validation

Deploy to Cloudflare.

Execute live Telegram requests.

Verify:

- Every request receives a unique correlation identifier.
- Runtime telemetry is generated.
- Execution completes successfully.
- Failures terminate safely.
- Runtime state is cleaned after completion.

---



## Acceptance Criteria

The Execution Manager is complete when:

- Every request executes through one execution context.
- Runtime lifecycle is deterministic.
- Correlation identifiers are consistently assigned.
- Runtime telemetry is complete.
- Failures propagate safely.
- No subsystem bypasses the Execution Manager.
- Execution state never leaks between requests.

---



## End-to-End Validation

Validate the Execution Manager using live requests against the deployed Cloudflare environment.

Successful validation demonstrates that:

- requests consistently enter through the Execution Manager
- runtime state is isolated per request
- execution contexts are created and destroyed correctly
- runtime telemetry reconstructs complete execution history
- failures terminate cleanly without affecting subsequent requests

Completion of these scenarios verifies that the application kernel provides a reliable execution environment for all higher-level components.

# 5. Conversation Manager



## Purpose

The Conversation Manager owns all conversational state required to maintain a coherent dialogue with the store owner.

It enables the application to understand follow-up messages, resolve references, continue partially completed workflows and manage clarification conversations across multiple turns.

The Conversation Manager exists solely to support conversational reasoning.

It is not responsible for business memory, business correctness or business persistence.

---



## Why this component exists

Business operations are frequently expressed over multiple conversational turns.

Examples include:

- "Make a bill."
- "Add two Maggi."
- "Drop the butter."
- "Actually make it six."
- "Use UPI."

Each individual message is incomplete.

Only the conversation as a whole represents the owner's intention.

The Conversation Manager reconstructs that conversational context so the Global Orchestrator receives a complete and coherent view of the current interaction.

---



## Responsibilities

The Conversation Manager is responsible for:

- Maintaining active conversation context.
- Tracking conversational references.
- Managing clarification workflows.
- Tracking incomplete business conversations.
- Reconstructing conversational context for the Global Orchestrator.
- Managing temporary conversational state.
- Detecting expired conversations.
- Cleaning obsolete conversational state.

The Conversation Manager is explicitly **not** responsible for:

- Business correctness.
- Inventory.
- Billing.
- Khata.
- Preferences.
- Business persistence.
- Tool execution.
- Business rule validation.

---



## Internal Architecture

```text
Incoming Message

↓

Conversation Context Builder

↓

Reference Resolver

↓

Clarification Manager

↓

Conversation State

↓

Conversation Context

↓

Global Orchestrator

```

---



## Internal Components



### Conversation Context Builder

Constructs the current conversational context.

It combines:

- current message
- recent conversation
- active workflow
- pending clarification
- temporary conversation state

into one coherent execution context.

---



### Reference Resolver

Resolves conversational references.

Examples include:

- "it"
- "that"
- "the first one"
- "same payment"
- "remove it"

The resolver converts these references into explicit business references before orchestration begins.

---



### Clarification Manager

Manages conversations requiring additional information.

Examples:

- Unknown product.
- Ambiguous product.
- Missing payment method.
- Multiple matching products.

The manager records:

- pending clarification
- expected answer
- associated business operation

When the owner replies, the clarification is resumed instead of starting a new workflow.

---



### Conversation State Manager

Maintains temporary conversation information.

Examples include:

- active draft bill reference
- pending clarification
- active conversational topic
- recently referenced entities
- temporary conversational variables

Conversation state is temporary and exists only to support ongoing dialogue.

---



### Conversation Cleanup

Removes expired conversational information.

Conversation state should not accumulate indefinitely.

Inactive conversations should be safely discarded without affecting business state.

---



## Public Interface

Input:

Application Request

Output:

Conversation Context

The Conversation Context contains sufficient information for the Global Orchestrator to understand the owner's current intent.

---



## Internal Workflow

```text
Receive Request

↓

Load Conversation State

↓

Resolve References

↓

Resume Pending Clarification

↓

Build Conversation Context

↓

Return Conversation Context

```

---



## Dependencies

Depends upon:

- Execution Manager

Used by:

- Global Orchestrator

The Conversation Manager never communicates directly with business capabilities.

---



## Runtime Rules

The following rules always apply.

- Conversation state is temporary.
- Conversation state never becomes business truth.
- Conversation state never bypasses business persistence.
- Clarification belongs to exactly one active workflow.
- Every conversation context is reconstructed before orchestration begins.
- Expired conversations are safely discarded.
- Business state always overrides conversational assumptions.

---



## Failure Cases



### Missing Conversation

Begin a new conversation.

No previous conversational assumptions are made.

---



### Invalid Reference

Unable to resolve conversational reference.

Request clarification from the owner.

---



### Expired Clarification

Discard pending clarification.

Request updated information.

---



### Multiple Possible References

Do not guess.

Initiate clarification.

---



### Corrupted Conversation State

Discard temporary conversation state.

Reconstruct conversation from available business information where possible.

---



## Observability

Conversation events should include:

- Correlation ID
- Conversation ID
- Active workflow
- Clarification status
- Reference resolution
- Conversation reconstruction duration
- Cleanup events

Business events are intentionally excluded.

---



## Test Strategy



### Unit Tests

- Conversation reconstruction.
- Reference resolution.
- Clarification management.
- Conversation cleanup.
- Temporary state handling.

---



### Integration Tests

- Multi-turn conversations.
- Clarification workflows.
- Draft bill continuation.
- Reference resolution across multiple messages.
- Expired conversation recovery.

---



### Cloud Validation

Deploy to Cloudflare.

Execute live Telegram conversations covering:

- Multi-turn billing.
- Product clarification.
- Payment clarification.
- Follow-up modifications.
- Conversation expiration.

Verify that conversational continuity is maintained while business correctness remains unaffected.

---



## Acceptance Criteria

The Conversation Manager is complete when:

- Multi-turn conversations are reconstructed correctly.
- Conversational references resolve correctly.
- Clarification workflows resume correctly.
- Temporary state never becomes business truth.
- Expired conversations are handled safely.
- The Global Orchestrator always receives a complete conversation context.

---



## End-to-End Validation

Validate against the deployed Telegram bot using realistic conversational scenarios.

Successful validation demonstrates that:

- Follow-up messages correctly continue previous interactions.
- Ambiguous requests trigger clarification rather than assumptions.
- Clarification responses resume the original workflow.
- Conversation resets do not affect persisted business information.
- Temporary conversation state is correctly isolated from durable business state.

The Conversation Manager is considered complete when conversational continuity is reliable without ever becoming the source of business truth.

# 6. Global Orchestrator

> ++**Orchestration is the runtime discovery, planning, coordination and verification of interactions between independent business capabilities in order to satisfy a business objective while preserving deterministic business correctness.**++



## 6.1 Purpose

The Global Orchestrator is the adaptive reasoning engine of the application.

Its purpose is not to execute business operations, enforce business rules or maintain business state.

Its purpose is to understand the owner's business intent. The orchestrator transforms business intent into one or more executable business objectives, determine which independent business capabilities must collaborate to satisfy that objective, coordinate their execution, and produce a grounded response based entirely on verified business facts.

The Global Orchestrator exists because the interactions between business capabilities cannot be predetermined.

If every interaction between Inventory, Billing, Khata, Analytics and Configuration could be expressed as fixed workflows, deterministic software would be sufficient.

However, natural language requests introduce an effectively unbounded number of execution paths.

The owner may express requests in incomplete, ambiguous or previously unseen ways.

A single request may require one business capability or many.

The required collaboration between those capabilities can only be determined after understanding the specific business objective expressed by the owner.

The Global Orchestrator performs this runtime discovery.

---

The orchestrator reasons in terms of **business objectives**, not software components.

For example, given the request:

> "Receive fifty packets of Maggi and then make a bill for five packets."

The orchestrator does not begin by thinking about Inventory or Billing.

Instead, it first identifies the business objectives.

Business Objective 1:

Increase available inventory by receiving newly delivered stock.

Business Objective 2:

Sell five packets to the customer.

Only after these objectives have been identified does the orchestrator determine which business capabilities own those objectives and coordinate their execution.

This separation ensures that the language model reasons about the business domain while the software architecture determines how that business objective is achieved.

---

The Global Orchestrator never becomes the owner of business knowledge.

Business capabilities remain the authoritative owners of their respective domains.

Inventory owns inventory correctness.

Billing owns billing correctness.

Khata owns credit management.

Analytics owns reporting.

Configuration owns owner preferences.

The orchestrator possesses no specialised business knowledge beyond identifying which capability owns a particular business objective.

It deliberately avoids learning the internal workflows, validation logic or execution procedures of any capability.

This prevents business logic from accumulating inside the orchestrator and preserves clear subsystem ownership throughout the application.

---

The Global Orchestrator is therefore responsible for coordinating collaboration rather than performing execution.

Its role within the system is conceptually similar to that of a software architect during runtime.

Given a business objective, it determines:

- which business capabilities are required,
- the order in which they should participate,
- whether clarification is required before execution,
- whether additional business capabilities become necessary as execution progresses,
- when the business objective has been fully satisfied,
- and when sufficient verified evidence exists to produce a grounded response.

The orchestrator continuously evaluates the evolving execution state and adapts its coordination strategy based on newly verified business facts returned by the participating capabilities.

Execution plans are therefore discovered during runtime rather than predetermined during development.

---

The Global Orchestrator never executes business operations directly.

Every business operation is delegated to the owning business capability.

Likewise, the orchestrator never modifies persistent business state.

Persistent business state is modified exclusively through deterministic business operations implemented by the responsible capability.

This separation allows the language model to remain adaptive while ensuring that business correctness remains entirely deterministic.

---

The output of the Global Orchestrator is never business truth.

Business truth is established only by successful execution and verification within the business capabilities.

The orchestrator's responsibility is to transform verified business truth into a coherent conversational response without introducing unsupported assumptions, inferred facts or hallucinated information.

Consequently, the orchestrator serves as the bridge between probabilistic reasoning and deterministic business software.

It provides the flexibility required to understand natural language while preserving the correctness, auditability and predictability expected of production business systems.

## 6.2 Why this component exists

Traditional software systems operate by following predefined execution paths.

A request enters the system, a predetermined workflow is selected, and each component executes according to logic that was defined during development.

This approach works only when the interactions between software components are known in advance.

The system being built in this assessment fundamentally differs from that model.

The owner communicates through unrestricted natural language.

The same business intent may be expressed in thousands of different ways.

A single request may require one business capability or multiple business capabilities.

The sequence of collaboration between those capabilities cannot be fully predetermined during development.

Consequently, the system requires a runtime component capable of discovering how independent responsibility-owning subsystems should collaborate to satisfy the owner's business intent.

That responsibility belongs exclusively to the Global Orchestrator.

---

The orchestrator exists because **runtime collaboration is dynamic**.

Business capabilities are intentionally designed as independent software subsystems.

Each capability owns one business domain.

Each capability encapsulates its own business rules, validation logic, deterministic execution and business correctness.

Capabilities intentionally know nothing about each other.

Inventory does not understand Billing.

Billing does not understand Analytics.

Analytics does not understand Khata.

Configuration does not understand Inventory.

This isolation preserves architectural independence and prevents business logic from becoming distributed across multiple components.

However, solving a real business request frequently requires several capabilities to participate.

The orchestrator discovers this collaboration dynamically during execution.

---

The orchestrator therefore solves a software engineering problem rather than a business problem.

Its responsibility is not to perform inventory management or billing.

Its responsibility is to determine **which software components must collaborate**, **in what order**, and **under what conditions** to satisfy the user's business intent.

The orchestrator reasons about collaboration.

Business capabilities reason about their respective business domains.

---

Another reason for the orchestrator's existence is to minimize the reasoning space presented to the language model.

The application exposes many business operations distributed across multiple independent capabilities.

Allowing the language model to reason over every operation simultaneously would unnecessarily increase complexity and reduce reliability.

Instead, reasoning occurs hierarchically.

The Global Orchestrator first determines which business capability owns the user's intent.

Only after delegation does the selected capability determine the appropriate business operation(s) required to fulfil that intent.

This hierarchical decomposition mirrors traditional software engineering, where high-level modules coordinate lower-level modules without owning their internal implementation.

---

The orchestrator also establishes a strict separation between probabilistic reasoning and deterministic execution.

The language model is responsible for understanding language, identifying business intent, planning collaboration and coordinating execution.

Deterministic software remains responsible for validation, business rules, persistence, invariant preservation and state mutation.

This separation allows the system to benefit from adaptive reasoning while ensuring that business correctness never depends upon probabilistic behaviour.

---

Finally, the orchestrator exists to preserve architectural scalability.

As new business capabilities are introduced, existing capabilities remain unchanged.

The orchestrator simply learns that an additional capability exists and determines when it should participate during execution.

The architecture therefore evolves by extending the capability ecosystem rather than by modifying existing business subsystems.

This preserves subsystem independence, minimizes coupling and allows the software to grow without fundamentally changing its architectural model.

## 6.3 Responsibilities

The Global Orchestrator is responsible for coordinating the complete reasoning lifecycle of every business request.

It transforms natural language into an executable collaboration plan, supervises execution, verifies that sufficient evidence has been collected and produces a grounded response for the owner.

The orchestrator never owns business correctness, business state or business execution.

Instead, it owns the coordination of independent business capabilities.

Its responsibilities are defined below.

---



### 1. Business Intent Identification

The first responsibility of the orchestrator is to understand the owner's business intent.

Natural language is interpreted to determine what business outcome the owner wishes to achieve, independent of how that request was phrased.

At this stage the orchestrator reasons purely about business meaning.

No business capability is selected.

No business operation is planned.

No execution occurs.

The output of this responsibility is a clear representation of the owner's business intent.

---



### 2. Business Objective Planning

Once business intent has been identified, the orchestrator decomposes that intent into one or more executable business objectives.

Business objectives represent concrete outcomes that must be achieved in order to satisfy the owner's intent.

The orchestrator plans *what* must be accomplished rather than *how* it will be accomplished.

Business objectives remain implementation-independent.

They do not reference tools, databases or internal software components.

---



### 3. Capability Coordination

For each business objective, the orchestrator determines which business capability owns that responsibility.

The orchestrator delegates work at the capability level rather than at the business operation level.

Business capabilities remain responsible for deciding:

- which business operations must execute,
- execution order,
- internal validation,
- business rules,
- deterministic execution,
- and verification.

The orchestrator coordinates collaboration between capabilities without understanding their internal implementation.

---



### 4. Execution Supervision

During execution, the orchestrator continuously supervises the overall progress of the request.

Rather than assuming execution succeeded, it observes the verified outcomes returned by each participating capability.

The orchestrator determines:

- whether the current business objective has been satisfied,
- whether additional capabilities must participate,
- whether further reasoning is required,
- or whether execution can terminate successfully.

Execution therefore evolves according to verified business evidence rather than predetermined workflows.

---



### 5. Clarification Management

The orchestrator is responsible for determining when sufficient information is unavailable to continue execution safely.

Whenever ambiguity prevents reliable execution, the orchestrator suspends planning and requests clarification from the owner.

Execution resumes only after sufficient information has been obtained.

Clarification is treated as part of the reasoning process rather than as a business operation.

---



### 6. Cross-Capability Collaboration

Business capabilities remain intentionally independent.

They never communicate directly with one another.

Whenever multiple business domains must participate in the same request, the orchestrator coordinates their interaction.

It determines:

- participation order,
- information flow,
- dependency satisfaction,
- and overall execution strategy.

The orchestrator therefore becomes the only component responsible for collaboration across subsystem boundaries.

---



### 7. Grounded Response Generation

The orchestrator is responsible for transforming verified business facts into natural language.

Responses must be generated exclusively from evidence returned by the participating business capabilities.

The orchestrator must never invent, infer or extend business facts beyond the verified evidence supplied during execution.

Natural language generation is therefore grounded entirely in deterministic business truth.

---



### 8. Execution Lifecycle Decisions

Throughout execution, the orchestrator continuously evaluates the state of the request.

After every capability completes its work, the orchestrator determines one of the following actions:

- continue execution,
- delegate to another capability,
- request clarification,
- regenerate the response,
- or terminate execution.

This iterative decision-making process forms the application's adaptive control loop.

The next action is always determined from the current verified execution state rather than from a predefined workflow.

---



### 9. Architectural Boundary Preservation

The orchestrator is responsible for preserving the architectural integrity of the system.

It must never assume responsibilities that belong to another subsystem.

Specifically, the orchestrator must never:

- perform business operations,
- modify business state,
- enforce business rules,
- validate business invariants,
- calculate business correctness,
- or access persistence directly.

By remaining exclusively responsible for coordination and reasoning, the orchestrator preserves clear ownership boundaries across the entire architecture and prevents business logic from accumulating within the application's central reasoning engine.

---

Collectively, these responsibilities define the constitutional boundaries of the Global Orchestrator.

Every subsequent aspect of the orchestrator's implementation—including planning, delegation, verification, grounding and failure handling—must operate entirely within these responsibilities.

No future enhancement to the system should require expanding the orchestrator beyond these constitutional boundaries.

## 6.4 Internal Architecture

The Global Orchestrator is the adaptive reasoning engine of the application.

Its internal architecture is intentionally divided into **reasoning** and **deterministic execution**.

This separation is one of the fundamental architectural decisions of the system.

The language model is responsible for understanding the business problem, planning collaboration between business capabilities and making strategic decisions during execution.

Deterministic software is responsible for executing those decisions, enforcing business correctness, preserving invariants, verifying execution and producing trusted business facts.

This architecture deliberately minimizes the amount of responsibility owned by the language model.

Once the language model has completed a reasoning step, deterministic software takes over wherever possible.

The system therefore combines adaptive reasoning with deterministic execution instead of allowing the language model to control the entire execution lifecycle.

---



### Internal Architecture

```text
                           Global Orchestrator

                        ┌───────────────────────┐
                        │      Planning Mode    │
                        └───────────────────────┘
                                   │
                    ┌──────────────┼──────────────┐
                    │              │              │
                    ▼              ▼              ▼

              Intent Analysis  Objective Planning  Capability Planning

                                   │
                                   ▼

                          Structured Execution Plan

                                   │

──────────────────────────────────────────────────────────────────────────
                Deterministic Software Boundary
──────────────────────────────────────────────────────────────────────────

                                   │
                                   ▼

                          Execution Engine (Code)

                                   │

                      Execute One Plan Step At A Time

                                   │

                      Verify Execution After Every Step

                                   │

                                   ▼

                         Verified Execution Result

──────────────────────────────────────────────────────────────────────────
                 Return To Adaptive Reasoning
──────────────────────────────────────────────────────────────────────────

                                   │
                                   ▼

                        ┌───────────────────────┐
                        │     Decision Mode     │
                        └───────────────────────┘

                                   │

             ┌──────────────┬───────────────┬───────────────┐
             ▼              ▼               ▼               ▼

         Continue        Re-plan       Ask Clarification   Generate Response

                                   │
                                   ▼

                       Grounded Natural Language Response
```

---



### Architectural Philosophy

The orchestrator never performs business execution directly.

Instead, it alternates between two fundamentally different reasoning modes separated by deterministic software.

Planning is performed by the language model.

Execution is performed by deterministic software.

Decision making is again performed by the language model.

This architecture intentionally removes repetitive execution logic from the language model while preserving its ability to reason about changing runtime situations.

---



### Planning Mode

Planning Mode is responsible for transforming natural language into an executable collaboration plan.

It performs three reasoning activities.

#### Intent Analysis

The first responsibility is to understand the owner's business intent.

The orchestrator reasons purely about what the owner wants to accomplish.

No business capability is selected.

No execution begins.

No business operation is chosen.

The output is a structured representation of the owner's business intent.

---



#### Objective Planning

Business intent is transformed into one or more executable business objectives.

Objectives describe the desired business outcomes rather than implementation details.

Example

Business Intent

> Receive fifty packets of Maggi and sell five.

Business Objectives

- Inventory reflects newly received stock.
- Customer receives a finalized bill.
- Inventory reflects the completed sale.

Objectives intentionally remain independent of software implementation.

---



#### Capability Planning

The orchestrator determines which business capabilities are required to satisfy each objective.

Each business objective is assigned to exactly one owning Business Capability.

The execution plan therefore consists of a sequence of objective-capability assignments rather than individual tool invocations.

The orchestrator deliberately stops at the capability boundary.

It never reasons about the internal implementation of a capability.

Importantly, the orchestrator delegates only at the **Business Capability** level.

It never determines:

- which business operations to execute,
- which tools to invoke,
- execution order inside the capability,
- validation logic,
- business rules,
- or verification logic.

Those responsibilities belong exclusively to the owning business capability.

The output of Planning Mode is therefore a **Structured Execution Plan**.

Example (conceptual)

```text
Objective 1

Inventory Capability

-------------------------

Objective 2

Billing Capability
```

Planning Mode terminates once a valid execution plan has been produced.

---



### Execution Engine

The Execution Engine is a deterministic software component.

It is **not** part of the language model.

Its responsibility is to execute the Structured Execution Plan generated by Planning Mode.

The Execution Engine owns:

- execution sequencing,
- capability invocation,
- dependency enforcement,
- runtime coordination,
- execution verification,
- collection of verified business facts.

The language model never executes capabilities directly.

Instead, it delegates execution to the Execution Engine.

The Execution Engine executes one plan step at a time.

After each completed step it verifies execution and produces structured execution results before continuing to the next step.

This allows deterministic software to own repetitive execution while allowing the language model to remain focused on strategic reasoning.

---



### Decision Mode

Once execution pauses or completes, control returns to the Global Orchestrator.

Rather than generating another execution plan immediately, the orchestrator enters Decision Mode.

Decision Mode reasons over:

- the original business intent,
- the remaining business objectives,
- verified execution results,
- blocked objectives,
- newly discovered business facts.

Decision Mode determines exactly one of the following actions.

### Continue Execution

Continue with the remaining objectives using the existing execution plan.

---



### Re-plan

Modify the execution strategy because newly verified information changes the business situation.

---



### Request Clarification

Suspend execution and obtain additional information from the owner.

Examples include:

- ambiguous products,
- missing payment information,
- unresolved customer identity,
- conflicting business information.

---



### Generate Final Response

Determine that all business objectives have been satisfied and instruct the orchestrator to generate the final grounded response.

---



### Runtime Control Loop

The orchestrator therefore operates as a continuous reasoning loop.

```text
Conversation

↓

Planning Mode

↓

Execution Plan

↓

Execution Engine

↓

Verified Execution Results

↓

Decision Mode

↓

Continue

or

Re-plan

or

Clarify

or

Respond
```

Unlike traditional workflow engines, the execution path is not predetermined.

The orchestrator continuously adapts its strategy according to verified business evidence produced during execution.

---



### Architectural Rules

The following architectural rules always apply.

- The language model never invokes business operations directly.
- Business capabilities remain completely independent.
- The orchestrator delegates only to business capabilities.
- The Execution Engine owns deterministic execution.
- Every execution step produces verified execution results.
- Every reasoning cycle begins from verified business facts rather than assumptions.
- The orchestrator reasons only between deterministic execution phases.
- Business correctness never depends upon language model behaviour.

This architecture establishes a clear separation between probabilistic reasoning and deterministic software execution.

The language model is responsible for discovering how independent business capabilities should collaborate to satisfy the owner's business intent.

Deterministic software is responsible for ensuring that this collaboration executes correctly, safely and verifiably.

## 6.5 Orchestration Constitution

The Global Orchestrator is governed by a fixed constitutional contract.

This constitution defines the architectural rules that every reasoning cycle must obey regardless of the business request being processed.

The purpose of the constitution is to ensure that adaptive reasoning never compromises deterministic business correctness.

While the reasoning performed by the language model is inherently dynamic, the process by which reasoning occurs remains deterministic and predictable.

Every orchestration cycle must satisfy the following constitutional principles.

---



### Principle 1 — Reason Before Acting

The orchestrator must never execute or delegate work before first understanding the owner's business intent.

Every execution begins with reasoning.

Execution is never initiated directly from natural language.

Natural language is first transformed into structured business intent.

Business intent is then transformed into executable business objectives.

Only after this reasoning process completes may execution planning begin.

---



### Principle 2 — Plan Before Execution

The orchestrator must always produce an explicit execution plan before deterministic execution begins.

Execution must never emerge organically through repeated tool calls.

The execution plan becomes the contract between adaptive reasoning and deterministic software.

Once execution begins, deterministic software becomes responsible for carrying out the plan.

---



### Principle 3 — Delegate by Capability Ownership

The orchestrator delegates only to Business Capabilities.

It never delegates directly to tools or business operations.

Each capability owns all knowledge relating to its business domain, including:

- business operations,
- validation,
- dependency resolution,
- business rules,
- invariant preservation,
- execution verification,
- verified business facts.

This preserves subsystem ownership and prevents business knowledge from accumulating inside the orchestrator.

---



### Principle 4 — Separate Reasoning from Execution

The language model reasons.

Deterministic software executes.

The orchestrator never performs business execution itself.

Likewise, deterministic software never performs strategic reasoning.

Execution therefore alternates between two phases.

Adaptive reasoning.

Deterministic execution.

This separation minimizes the amount of responsibility owned by probabilistic software.

---



### Principle 5 — Reason Only from Verified Facts

The orchestrator must never reason from assumptions, cached beliefs or previously generated responses.

Every reasoning cycle begins from the current verified execution state.

Business capabilities establish business truth.

The orchestrator consumes business truth.

Verified business facts therefore become the only authoritative evidence available to the reasoning engine.

---



### Principle 6 — Preserve Capability Independence

Business capabilities remain completely independent of one another.

They never communicate directly.

They never invoke one another.

They never coordinate execution.

The orchestrator is solely responsible for discovering and coordinating collaboration between independent capabilities.

This ensures that each business capability can evolve independently without introducing coupling into the rest of the architecture.

---



### Principle 7 — Clarify Rather Than Guess

Whenever verified information is insufficient to continue execution safely, the orchestrator must suspend execution and request clarification.

Examples include:

- ambiguous products,
- multiple matching entities,
- incomplete payment information,
- conflicting business information,
- missing customer identity.

Execution resumes only after sufficient information has been obtained.

The orchestrator must never compensate for missing business information through probabilistic inference.

---



### Principle 8 — Adapt Continuously

Execution plans are not immutable.

After every deterministic execution phase, the orchestrator evaluates the updated execution state.

It then determines whether:

- the existing plan remains valid,
- additional objectives have emerged,
- replanning is required,
- clarification is necessary,
- or the business request has been completed.

The orchestrator therefore behaves as an adaptive planner rather than a static workflow engine.

---



### Principle 9 — Generate Responses Only After Execution

Natural-language responses are the final product of execution rather than part of execution itself.

The orchestrator must never generate a business response before deterministic execution has completed or paused.

All business operations must therefore precede conversational output.

This prevents conversational reasoning from influencing business correctness.

---



### Principle 10 — Ground Every Response

Every factual statement returned to the owner must be traceable to verified business facts produced during deterministic execution.

The orchestrator is prohibited from:

- inventing business facts,
- extending verified facts,
- generalizing beyond verified evidence,
- substituting model knowledge for business state.

If sufficient evidence does not exist, the orchestrator must either request clarification or explicitly communicate that the requested information cannot be established.

Grounding is therefore treated as a constitutional requirement rather than a prompting technique.

---



### Principle 11 — Terminate Only on Stable States

Every orchestration cycle must terminate in exactly one stable outcome.

The valid terminal states are:

- Business request successfully completed.
- Waiting for user clarification.
- Business request safely refused.
- Recoverable system failure communicated.
- Non-recoverable system failure communicated.

The orchestrator must never terminate while execution remains in an indeterminate state.

---



### Constitutional Summary

The constitution establishes one fundamental architectural principle:

> **Adaptive reasoning determines what should happen next. Deterministic software proves what actually happened.**

The orchestrator exists to coordinate independent business capabilities, not to replace them.

Every reasoning cycle therefore begins with business intent, proceeds through capability collaboration, depends upon verified business facts and concludes only with a grounded response whose factual claims are fully supported by deterministic business execution.

## 6.6 Complete Orchestration Control Loop

The Global Orchestrator operates as a continuous adaptive control loop.

Unlike traditional workflow engines, the sequence of business capability collaboration is not predetermined during development.

Instead, collaboration is continuously discovered, evaluated and refined during execution according to the current business situation.

The orchestrator therefore does not execute a fixed workflow.

It continuously reasons over verified business facts until the owner's business intent has either been satisfied or a stable terminal state has been reached.

---



### Complete Control Loop

```text
                 New User Message
                         │
                         ▼
        ┌─────────────────────────────────┐
        │ Build Execution Context         │
        │ + Conversation Context          │
        └─────────────────────────────────┘
                         │
                         ▼
        ┌─────────────────────────────────┐
        │ Understand Business Intent      │
        └─────────────────────────────────┘
                         │
                         ▼
        ┌─────────────────────────────────┐
        │ Create / Update Business        │
        │ Objectives                      │
        └─────────────────────────────────┘
                         │
                         ▼
        ┌─────────────────────────────────┐
        │ Build Execution Plan            │
        └─────────────────────────────────┘
                         │
                         ▼
────────────────────────────────────────────────────
        Deterministic Execution Boundary
────────────────────────────────────────────────────
                         │
                         ▼
        ┌─────────────────────────────────┐
        │ Execute Plan                    │
        │ (Execution Engine)              │
        └─────────────────────────────────┘
                         │
                         ▼
        ┌─────────────────────────────────┐
        │ Business Verification           │
        │ (Capabilities)                  │
        └─────────────────────────────────┘
                         │
                         ▼
        ┌─────────────────────────────────┐
        │ Verified Business Facts         │
        └─────────────────────────────────┘
                         │
────────────────────────────────────────────────────
        Return To Adaptive Reasoning
────────────────────────────────────────────────────
                         │
                         ▼
        ┌─────────────────────────────────┐
        │ Evaluate Current Situation      │
        └─────────────────────────────────┘
                         │
                         ▼

        ┌──────────────┬──────────────┬──────────────┬──────────────┐
        ▼              ▼              ▼              ▼

 Continue Plan     Re-plan      Ask Clarification   Generate Response

        │              │              │              │
        └──────┬───────┴──────┬───────┴──────────────┘
               │              │
               ▼              ▼
         Back To Loop     Faithfulness Verification
                                  │
                                  ▼
                         Grounded Response
```

---



## Loop Stages



### Stage 1 — Context Construction

The orchestrator begins by constructing the complete execution context.

This combines:

- execution context,
- conversation context,
- active clarification state,
- previously verified business facts,
- active business objectives.

The orchestrator never reasons from the user's message in isolation.

Every reasoning cycle begins from the complete current state of the business interaction.

---



### Stage 2 — Business Intent Identification

The orchestrator identifies the owner's business intent.

Intent identification focuses solely on understanding the desired business outcome.

No execution planning occurs during this stage.

The output is a structured description of what the owner is attempting to accomplish.

---



### Stage 3 — Business Objective Planning

The identified business intent is transformed into one or more executable business objectives.

Objectives describe business outcomes rather than implementation details.

Objectives may be:

- newly created,
- resumed from a previous interaction,
- modified according to newly discovered information,
- or marked as already satisfied.

The orchestrator reasons about desired outcomes rather than software implementation.

---



### Stage 4 — Execution Planning

The orchestrator determines which business capabilities are required to satisfy the remaining objectives.

Each business objective is assigned to exactly one owning Business Capability.

The execution plan therefore consists of a sequence of objective-capability assignments rather than individual tool invocations.

The orchestrator deliberately stops at the capability boundary.

It never reasons about the internal implementation of a capability.

An explicit execution plan is produced.

The execution plan identifies:

- participating business capabilities,
- execution sequence,
- capability dependencies,
- objective ownership.

The execution plan deliberately avoids business operations and tool selection.

Those responsibilities belong exclusively to the participating business capabilities.

---



### Stage 5 — Deterministic Execution

Control passes to the Execution Engine.

For each objective-capability assignment contained within the execution plan, the Execution Engine invokes the owning Business Capability.

The Business Capability now becomes responsible for satisfying the assigned business objective.

How that objective is achieved is entirely the responsibility of the capability itself.

The Global Orchestrator neither knows nor controls the capability's internal execution strategy.

#### Capability Internal Orchestration

Every Business Capability implements its own internal orchestration.

The capability receives a business objective rather than a request to invoke a specific tool.

It is therefore responsible for determining:

- which business operations are required,
- which tools must be invoked,
- tool ordering,
- dependency resolution,
- business rule enforcement,
- execution verification,
- production of verified business facts.

The capability may invoke one tool or many tools.

Its internal orchestration remains completely encapsulated behind the capability boundary.

To the Global Orchestrator, every capability behaves as a deterministic black box that accepts a business objective and returns verified business facts.

```Important p.s
the business capability to figure out which tools to use and how that subsection would be orchestrated would be similar to how this is orchestrated."

I think that's more than an implementation detail.

We've actually discovered that the architecture is recursive.

Conceptually:

Global Orchestrator

    Objective

        ↓

Business Capability

    Objective

        ↓

Business Operations

        ↓

Tools

        ↓

Verification

        ↓

Verified Facts

The Global Orchestrator doesn't orchestrate tools.

A Business Capability is itself a mini orchestrator for its own domain.

The difference is scope:

Global Orchestrator orchestrates between business domains.
Business Capability orchestrates within one business domain.

That symmetry is elegant because it means later we can define a common agent/runtime contract (the "template agent" you mentioned), and both the Global Orchestrator and every Business Capability can implement the same lifecycle with different responsibilities. I think that will make the implementation cleaner and the architecture more internally consistent.
```

---



### Stage 6 — Business Verification

Once the capability determines that its assigned objective has been satisfied, it performs deterministic verification before returning control to the Global Orchestrator before returning control.

Verification includes:

- precondition validation,
- business rule enforcement,
- invariant preservation,
- postcondition verification.

The output is never a simple success indicator.

Instead, each capability returns verified business facts describing the resulting business state.

These verified facts become the only authoritative evidence available to the orchestrator.

---



### Stage 7 — Situation Evaluation

Control returns to the orchestrator.

The orchestrator evaluates:

- original business intent,
- remaining business objectives,
- verified business facts,
- blocked objectives,
- execution failures,
- clarification requirements.

Importantly, the orchestrator reasons only over verified evidence.

No assumptions are introduced during evaluation.

---



### Stage 8 — Runtime Decision

Based on the current execution state, the orchestrator selects exactly one next action.

#### Continue Execution

The current execution plan remains valid.

Remaining objectives continue.

---



#### Re-plan

Previously verified business facts have changed the situation.

The execution strategy must be updated.

---



#### Request Clarification

Execution cannot safely continue because required business information is unavailable.

Execution pauses until the owner responds.

---



#### Generate Response

All executable business objectives have been satisfied.

Execution terminates and response generation begins.

---



### Stage 9 — Faithfulness Verification

Once a response has been generated, the orchestrator performs a final faithfulness verification.

Every factual claim contained within the response is compared against the verified business facts collected during execution.

Unsupported claims are rejected.

If verification fails, the response is regenerated using the same verified business facts.

Business execution is never repeated solely because response generation failed.

---



### Stage 10 — Response Delivery

Only after successful faithfulness verification is the grounded response returned to the owner.

The owner therefore interacts exclusively with verified business truth rather than probabilistic model output.

---



## Architectural Properties

This control loop guarantees the following properties.

### Adaptive Collaboration

Business capability collaboration is discovered dynamically during execution.

No fixed workflow is required.

---



### Deterministic Business Correctness

All business state changes occur inside deterministic business capabilities.

The language model never modifies business state directly.

---



### Continuous Replanning

Execution plans remain adaptable throughout execution.

Verified business facts continuously influence future reasoning.

---



### Evidence-Based Reasoning

Every reasoning cycle begins from verified business facts rather than assumptions or previous model outputs.

---



### Strict Separation of Responsibilities

Reasoning remains probabilistic.

Execution remains deterministic.

Verification remains evidence-based.

Business correctness therefore does not depend upon language model behaviour.

---



## Control Loop Termination

The orchestration loop terminates only when one stable outcome has been reached.

The valid terminal outcomes are:

- The business request has been successfully completed.
- Additional user clarification is required.
- The request has been safely refused according to business rules.
- A recoverable system failure has been communicated.
- A non-recoverable system failure has been communicated.

No orchestration cycle may terminate while business objectives remain in an indeterminate state.

The control loop therefore guarantees that every request concludes in a well-defined, observable and architecturally valid outcome.

## 6.7 Capability Delegation Model

The Global Orchestrator delegates work exclusively at the Business Capability boundary.

It never delegates individual tools, database operations or business functions.

Delegation represents the transfer of responsibility for achieving a business objective from the Global Orchestrator to the Business Capability that owns the corresponding business domain.

This ownership model is one of the fundamental architectural principles of the system.

---



### Delegation Boundary

The Global Orchestrator and the Business Capabilities own different responsibilities.

The Global Orchestrator owns:

- understanding business intent,
- planning business objectives,
- selecting the owning Business Capability,
- coordinating collaboration,
- supervising overall execution.

A Business Capability owns:

- understanding its assigned business objective,
- internal planning,
- business operation selection,
- tool orchestration,
- dependency resolution,
- business rule enforcement,
- invariant preservation,
- deterministic execution,
- execution verification,
- production of verified business facts.

The orchestrator deliberately stops reasoning at the capability boundary.

Everything beyond that boundary belongs exclusively to the Business Capability.

---



### Delegation Contract

A capability is never instructed to execute a specific tool.

Instead, it receives a structured business objective.

Conceptually:

```text
Business Objective

↓

Owning Business Capability

↓

Internal Capability Orchestration

↓

Verified Business Facts
```

The capability therefore owns both the implementation strategy and the correctness of the assigned objective.

---



### Internal Capability Orchestration

Each Business Capability behaves as an independent domain-specific orchestrator.

After receiving a business objective, the capability determines:

- which business operations are required,
- which tools should be invoked,
- execution order,
- dependency satisfaction,
- validation strategy,
- verification strategy,
- completion criteria.

These decisions remain completely encapsulated inside the capability.

The Global Orchestrator neither knows nor controls the capability's internal execution process.

---



### Tool Ownership

Tools are implementation details of a Business Capability.

They are never exposed directly to the Global Orchestrator.

This provides several architectural advantages:

- Business rules remain localized.
- Tool evolution does not affect orchestration.
- New tools may be added without modifying the Global Orchestrator.
- Capability internals remain independently testable.

The orchestrator therefore reasons entirely in terms of business domains rather than software implementation.

---



### Recursive Orchestration

The orchestration architecture is intentionally recursive.

The Global Orchestrator coordinates collaboration between business domains.

Each Business Capability coordinates collaboration between business operations within its own domain.

This creates a consistent execution model throughout the application.

```text
Global Orchestrator

↓

Business Capability

↓

Business Operations

↓

Tools

↓

Verification

↓

Verified Business Facts
```

Every orchestration layer follows the same architectural philosophy:

- reason,
- delegate,
- execute deterministically,
- verify,
- return evidence.

Only the scope of responsibility changes.

---



### Capability Completion

A capability completes its work only when one of the following outcomes has been reached.

- The assigned business objective has been successfully achieved.
- Additional user information is required.
- Execution cannot continue because of a business rule.
- Execution cannot continue because of a system failure.

A capability never returns a simple success or failure indicator.

Instead, it returns a structured execution result containing:

- objective status,
- verified business facts,
- unresolved objectives,
- clarification requirements,
- execution diagnostics.

This execution result becomes the input for the next reasoning cycle performed by the Global Orchestrator.

---



### Architectural Principle

Business Capabilities are autonomous domain experts.

The Global Orchestrator coordinates those experts but never performs their work.

This separation ensures that business knowledge remains distributed according to responsibility boundaries while strategic coordination remains centralized within the orchestrator.

The result is an architecture that is modular, extensible and capable of evolving by introducing new capabilities without increasing the complexity of the Global Orchestrator.

## 6.8 Multi-Capability Collaboration

Most real business requests cannot be satisfied by a single Business Capability.

Instead, they require multiple independent business domains to collaborate while preserving their architectural independence.

The purpose of the Global Orchestrator is not only to delegate work, but also to discover, coordinate and supervise this collaboration during runtime.

Business Capabilities therefore never collaborate directly with one another.

All collaboration is mediated by the Global Orchestrator.

This ensures that subsystem independence is preserved regardless of how many business capabilities participate in a request.

---



### Architectural Principle

Every Business Capability owns exactly one business domain.

A capability never owns another capability's responsibilities.

Likewise, a capability never assumes knowledge about another business domain.

Examples:

- Billing does not understand inventory management.
- Inventory does not understand khata.
- Khata does not understand analytics.
- Analytics does not understand billing.
- Configuration does not understand inventory.

Every capability behaves as an independent domain expert.

The Global Orchestrator becomes the only component responsible for coordinating those experts.

---



### Collaboration Model

The orchestrator collaborates with capabilities through objective ownership.

For every business objective:

1. The orchestrator identifies the owning capability.
2. The capability independently satisfies that objective.
3. The capability returns verified business facts.
4. The orchestrator evaluates the updated business situation.
5. The orchestrator determines whether another capability should participate.

The orchestrator therefore coordinates collaboration through verified business facts rather than direct capability communication.

```text
Business Intent

↓

Business Objectives

↓

Capability A

↓

Verified Business Facts

↓

Capability B

↓

Verified Business Facts

↓

Capability C

↓

Verified Business Facts

↓

Grounded Response
```

Business Capabilities never communicate with one another.

Only verified business facts flow between them through the Global Orchestrator.

---



### Collaboration Through Business Facts

Business Capabilities never exchange commands.

They never exchange internal state.

They never invoke one another.

The only information shared between capabilities is verified business information returned by completed execution.

For example:

Inventory Capability returns:

- Product exists.
- Inventory increased to sixty packets.

Billing Capability receives only those verified business facts that are relevant to its assigned objective.

It never receives Inventory's internal execution strategy, validation logic or tool usage.

This preserves strict encapsulation.

---



### Dynamic Runtime Collaboration

The collaboration pattern is never predetermined.

Instead, collaboration is discovered during runtime according to the owner's business intent and the verified execution results produced throughout execution.

The same business capability may participate:

- once,
- multiple times,
- or not at all,

depending entirely upon the evolving business situation.

The orchestrator therefore behaves as an adaptive collaboration engine rather than a predefined workflow engine.

---



### Capability Independence

Every Business Capability must satisfy the following architectural constraints.

It must not:

- invoke another capability,
- access another capability's persistence,
- enforce another capability's business rules,
- assume another capability's execution strategy,
- modify another capability's internal state.

The capability remains responsible only for the business domain it owns.

All cross-domain coordination remains the responsibility of the Global Orchestrator.

---



### Recursive Collaboration

Each Business Capability internally follows the same architectural philosophy as the Global Orchestrator.

After receiving an objective, the capability:

- understands the objective,
- plans its internal execution,
- orchestrates its own business operations,
- performs deterministic execution,
- verifies the resulting business state,
- produces verified business facts.

This creates a recursive orchestration architecture.

```text
Global Orchestrator

↓

Business Capability

↓

Business Operations

↓

Deterministic Tools

↓

Verified Business Facts
```

Only the scope changes.

The orchestration philosophy remains identical throughout the system.

---



### Collaboration Patterns

The architecture supports several collaboration patterns.

#### Sequential Collaboration

One capability depends upon verified business facts produced by another.

Example:

Inventory

↓

Billing

↓

Analytics

---



#### Independent Collaboration

Multiple capabilities execute independently because no dependency exists between their objectives.

The Execution Engine may execute them in any deterministic order.

---



#### Conditional Collaboration

Participation of a capability depends upon verified business facts produced during execution.

Example:

Billing determines that the customer wishes to purchase on credit.

The orchestrator introduces the Khata Capability into the execution plan.

---



#### Iterative Collaboration

Previously verified business facts require the orchestrator to revisit a capability later in execution.

Example:

The owner modifies a draft bill after inventory has already been queried.

The orchestrator delegates back to Billing to update the draft before continuing.

---



### Collaboration Completion

Collaboration completes only when every business objective has reached one of the following states.

- Successfully satisfied.
- Waiting for clarification.
- Safely refused.
- Failed because of a recoverable system error.
- Failed because of a non-recoverable system error.

Only after all objectives reach stable states may the orchestrator proceed to response generation.

---



### Architectural Principle

The application is intentionally designed as a collaboration of independent business experts rather than one intelligent monolithic agent.

The Global Orchestrator never replaces those experts.

Instead, it continuously discovers how they should collaborate to satisfy the owner's business intent while preserving subsystem independence, deterministic business correctness and architectural scalability.

## 6.9 Clarification Strategy

Natural language is inherently ambiguous.

The owner frequently provides incomplete, implicit or underspecified instructions that cannot be executed safely without additional information.

The purpose of the clarification strategy is to resolve ambiguity while preserving deterministic business correctness.

The orchestrator must therefore prefer requesting clarification over making probabilistic assumptions.

Clarification is treated as a first-class execution outcome rather than an error condition.

Execution pauses until sufficient information has been obtained.

---



### Architectural Principle

The orchestrator is responsible for deciding **whether clarification is required**.

The Business Capability is responsible for determining **what information is missing** to safely satisfy its assigned business objective.

This preserves the architectural ownership boundary.

The orchestrator understands the overall execution.

The capability understands its own business domain.

---



### Clarification Ownership

Clarification requests may originate from two different stages of execution.

#### Orchestrator-Level Clarification

The Global Orchestrator requests clarification when it cannot safely construct or coordinate the execution plan.

Examples include:

- Multiple possible business intents.
- Ambiguous business objective.
- Conflicting user instructions.
- Missing high-level business information.

Example:

> "Add atta."

The orchestrator cannot determine whether the owner intends to:

- receive inventory,
- sell inventory,
- create a product,
- modify an existing bill.

Execution planning cannot begin.

Clarification is therefore required before delegation.

---



#### Capability-Level Clarification

A Business Capability requests clarification when it cannot safely satisfy the assigned business objective.

The objective itself is already known.

However, information required to execute that objective is incomplete.

Examples include:

- Multiple matching products.
- Unknown customer.
- Missing payment method.
- Missing quantity.
- Missing unit.
- Missing invoice details.

Example:

Business Objective

> Sell atta.

Billing Capability determines:

Multiple products match "atta."

The capability returns:

```text
Status

Waiting For Clarification

Reason

Multiple matching products.

Required Information

Which atta variant?
```

The capability never asks the user directly.

Instead, it returns a structured clarification request to the Global Orchestrator.

The Global Orchestrator remains responsible for all user communication.

---



### Clarification Flow

```text
Business Intent

↓

Planning

↓

Capability

↓

Insufficient Information

↓

Structured Clarification Request

↓

Global Orchestrator

↓

Clarification Question

↓

Owner Response

↓

Conversation Manager Updates Context

↓

Orchestration Loop Resumes
```

The clarification becomes part of the ongoing execution rather than beginning a new conversation.

---



### Structured Clarification Contract

Every clarification request returned by a Business Capability contains:

- Objective Identifier
- Capability Identifier
- Clarification Reason
- Missing Information
- Expected Response Type
- Current Execution State

This allows the Global Orchestrator to resume execution deterministically once the owner's response has been received.

---



### Clarification Context

The Conversation Manager records every active clarification.

This includes:

- originating objective,
- originating capability,
- pending question,
- expected information,
- execution state before suspension.

When the owner replies, the orchestrator resumes the suspended execution rather than constructing a completely new execution plan.

The clarification therefore becomes part of the same execution lifecycle.

---



### Clarification Rules

The following constitutional rules always apply.

- Clarification must never modify business state.
- Clarification must never partially execute a business objective.
- Clarification pauses execution rather than terminating it.
- Only one clarification may remain active for a business objective at any given time.
- The orchestrator always owns communication with the owner.
- Business Capabilities never communicate with the owner directly.

---



### Clarification Completion

A clarification completes when one of the following outcomes occurs.

#### Information Received

The owner supplies the required information.

Execution resumes from the suspended objective.

---



#### Clarification Cancelled

The owner explicitly cancels the request.

The associated business objective is terminated safely.

---



#### Clarification Becomes Invalid

Subsequent conversation renders the pending clarification obsolete.

The clarification is discarded.

The orchestrator replans using the latest business intent.

---



### Architectural Principle

Clarification is not a conversational feature.

It is an execution mechanism.

Its purpose is to preserve business correctness by preventing the system from replacing missing business information with probabilistic assumptions.

Whenever sufficient evidence does not exist to continue safely, execution pauses, clarification is obtained and the orchestration loop resumes only after the required information has been verified.

## 6.10 Verification Architecture

The Verification Architecture establishes the trust model of the application.

Its purpose is to ensure that every business operation, every execution decision and every natural language response is supported by deterministic evidence rather than probabilistic assumptions.

Verification is not implemented as a single validation step.

Instead, it is applied continuously throughout the orchestration lifecycle.

Every stage verifies a different property of the system.

Only when all verification stages succeed is the execution considered complete.

---



## Verification Philosophy

The application distinguishes between three independent questions.

1. Is the execution plan valid?
2. Did the requested business operation execute correctly?
3. Does the final response accurately describe the verified business state?

Each question is answered by a different verification layer.

No single verification layer is responsible for system correctness.

Correctness emerges from the combination of all three.

---



# Layer 1 — Plan Verification

Plan Verification occurs immediately after the Global Orchestrator produces an execution plan and before deterministic execution begins.

Its purpose is to verify that the execution plan is internally consistent and executable.

This verification is performed entirely by deterministic software.

The language model never verifies its own plan.

---



### Responsibilities

Plan Verification confirms:

- every business objective has an owning Business Capability,
- every required capability exists,
- execution dependencies are satisfied,
- objective ordering is valid,
- required execution inputs are available,
- no objective is duplicated,
- no objective is unreachable,
- execution can begin safely.

If any verification fails, execution never begins.

Control returns to the Global Orchestrator for replanning.

---



### Output

Plan Verification produces one of two outcomes.

#### Plan Accepted

Execution begins.

#### Plan Rejected

Execution is rejected together with structured diagnostics explaining why the plan cannot be executed.

The Global Orchestrator reasons again using these diagnostics.

---



# Layer 2 — Business Verification

Business Verification is owned entirely by the Business Capability.

It verifies that the assigned business objective has actually been achieved.

Business Verification never relies upon language model reasoning.

Instead, it verifies deterministic business state.

Every capability follows the same execution contract.

```text
Receive Business Objective

↓

Validate Preconditions

↓

Resolve Dependencies

↓

Execute Business Operations

↓

Verify Postconditions

↓

Produce Verified Business Facts
```

A capability never returns "Success."

Instead it returns structured evidence describing what was verified.

---



### Preconditions

Execution begins only after verifying:

- required entities exist,
- required business information is available,
- dependencies have been satisfied,
- execution is permitted by business rules.

If any precondition fails, execution stops immediately.

---



### Business Operation Verification

Once execution completes, the capability verifies that the requested business objective has actually been achieved.

Verification compares the intended business outcome with the resulting business state.

Examples include:

Inventory

- inventory before,
- quantity received,
- inventory after.

Billing

- draft exists,
- inventory deducted,
- totals calculated,
- GST computed,
- bill persisted.

Khata

- previous balance,
- payment applied,
- updated balance verified.

Every capability defines verification appropriate to its own business domain.

---



### Verified Business Facts

The output of every capability is a structured collection of verified business facts.

These facts become the authoritative evidence used by the remainder of the orchestration loop.

Verified business facts include:

- objective status,
- verified business state,
- relevant business measurements,
- clarification requirements,
- execution diagnostics.

Business Capabilities never expose internal execution details.

Only verified business evidence leaves the capability boundary.

---



# Layer 3 — Faithfulness Verification

Faithfulness Verification occurs immediately before the response is returned to the owner.

Its purpose is to ensure that the natural language response contains only information supported by verified business facts.

Unlike Business Verification, this layer validates language rather than business state.

---



### Verification Strategy

The generated response is analysed as a collection of factual claims.

Each factual claim is compared against the verified business facts collected during execution.

Every claim must be fully supported.

Unsupported claims are rejected.

---



### Failure Modes

The Faithfulness Verifier specifically detects:

#### Unsupported Facts

Information not present within verified business facts.

---



#### Incorrect Attribute Association

Correct values associated with incorrect business entities.

Example:

Verified Facts

- Maggi = 5
- Coffee = 26

Response

"There are 26 packets of Maggi."

Verification Result

Rejected.

---



#### Hallucinated Generalisation

Extending verified evidence beyond what was actually established.

Example:

Verified Fact

One bill finalized successfully.

Response

"All pending bills have now been completed."

Verification Result

Rejected.

---



#### Unsupported Inference

Reasonable but unverified conclusions.

Only deterministic evidence may appear in the final response.

---



### Faithfulness Failure Handling

If faithfulness verification fails:

- business execution is **not** repeated,
- verified business facts remain unchanged,
- the response is regenerated,
- verification is performed again.

Only response generation is retried.

Business execution remains deterministic.

---



# Verification Flow

```text
Execution Plan

↓

Plan Verification

↓

Execution Engine

↓

Business Capability

↓

Business Verification

↓

Verified Business Facts

↓

Response Generation

↓

Faithfulness Verification

↓

Grounded Response
```

Every execution must successfully pass all three verification layers.

Skipping any layer violates the architectural constitution.

---



# Architectural Principles

The Verification Architecture is governed by the following principles.

- The language model never verifies its own execution.
- Every verification stage is deterministic.
- Verification always operates on evidence rather than assumptions.
- Business truth is established only through Business Verification.
- Natural language is validated independently through Faithfulness Verification.
- Failed verification never silently proceeds.
- Verification failures always produce structured diagnostics.
- Every response delivered to the owner is fully grounded in verified business facts.

---



## Architectural Summary

Verification is treated as a first-class architectural subsystem rather than an implementation detail.

The application therefore never asks:

> "Did the model produce a reasonable answer?"

Instead, it asks three deterministic questions:

1. Was the plan valid?
2. Was the business operation verified?
3. Was every statement in the response supported by verified business evidence?

Only when all three questions have been answered affirmatively is the execution considered complete.

## 6.11 Failure Handling Strategy

Failure is treated as a normal execution outcome rather than an exceptional condition.

The objective of the Failure Handling Strategy is not to eliminate failures.

The objective is to ensure that every failure preserves deterministic business correctness, produces an explainable execution state and allows the orchestration loop to terminate in a well-defined manner.

Business correctness always takes priority over successful execution.

---



## Architectural Philosophy

Every failure is classified according to the architectural layer in which it occurs.

Each layer owns its own recovery strategy.

Failures are never silently ignored.

Failures are never hidden from the orchestration loop.

Instead, failures become structured execution results that the Global Orchestrator reasons about in exactly the same way as successful execution.

---



## Failure Classification

The architecture recognizes five classes of failure.

### Planning Failure

Occurs before deterministic execution begins.

Examples:

- Unable to identify business intent.
- Invalid execution plan.
- Missing Business Capability.
- Unsatisfied execution dependencies.

Recovery Strategy

Execution never begins.

Structured diagnostics are returned to the Global Orchestrator.

The orchestrator either:

- replans,
- requests clarification,
- or safely terminates execution.

Business state remains unchanged.

---



### Business Failure

Occurs inside a Business Capability.

Examples:

- Product does not exist.
- Inventory insufficient.
- Customer not found.
- Khata account unavailable.
- Selling below cost.
- Invalid GST configuration.

Recovery Strategy

The capability immediately terminates execution of the affected business objective.

Business Verification determines that the objective has not been achieved.

Structured business diagnostics are returned to the Global Orchestrator.

The orchestrator decides whether to:

- clarify,
- replan,
- refuse,
- or terminate.

Business correctness remains preserved.

---



### Infrastructure Failure

Occurs outside business execution.

Examples:

- SQLite unavailable.
- Cloudflare runtime failure.
- Telegram API unavailable.
- LLM provider unavailable.
- Document generation failure.

Recovery Strategy

Execution immediately transitions into a system failure state.

Business Capabilities never attempt to compensate for infrastructure failures.

The failure is propagated to the Execution Engine (not global orchestrator) together with structured runtime diagnostics.

The execution engine determines whether the failure is recoverable.

---



### Verification Failure

Occurs when one of the verification layers rejects execution.

Examples:

- Invalid execution plan.
- Failed business verification.
- Failed faithfulness verification.

Recovery Strategy depends upon the verification layer.

Plan Verification

Return to planning.

Business Verification

Business objective fails.

Faithfulness Verification

Regenerate the response.

Business execution is never repeated solely because language generation failed.

---



### Unexpected Runtime Failure

Represents any failure that violates the expected execution path.

Examples include:

- unexpected exceptions,
- corrupted execution state,
- serialization failures,
- unknown runtime behaviour.

Recovery Strategy

Terminate the active execution safely.

Emit complete execution diagnostics.

Preserve all verified business state.

Reject all unverified execution results.

---



## Failure Propagation

Failures always propagate upward through the architecture.

Business Operations

↓

Business Capability

↓

Execution Engine

↓

Global Orchestrator

↓

Owner

Lower architectural layers never communicate failures directly to the owner.

Every failure is first interpreted by the Global Orchestrator.

This preserves a consistent conversational experience while maintaining architectural separation.

---



## Business State Protection

The most important responsibility of the failure strategy is protecting business truth.

The following guarantees always apply.

- Failed execution never becomes business truth.
- Unverified execution never becomes business truth.
- Partial execution never becomes business truth.
- Failed verification never becomes business truth.
- Business state changes only after successful deterministic verification.

Business correctness therefore remains independent of execution success.

---



## Recoverable Failures

Recoverable failures are those from which the orchestration loop may safely continue.

Examples include:

- clarification required,
- execution replanning,
- temporary infrastructure issue,
- retryable external dependency.

The orchestration loop remains active.

Execution resumes once the recovery condition has been satisfied.

---



## Non-Recoverable Failures

Non-recoverable failures prevent safe continuation.

Examples include:

- corrupted persistence,
- invalid runtime state,
- unrecoverable infrastructure failure,
- unrecoverable execution error.

The orchestration loop terminates.

A structured system failure is returned.

Business state remains unchanged.

---



## Failure Diagnostics

Every failure produces structured diagnostics.

Diagnostics include:

- Correlation Identifier
- Execution Identifier
- Business Objective
- Capability
- Failure Classification
- Failure Reason
- Recovery Recommendation
- Verification Status

These diagnostics become part of the execution history and support both runtime observability and post-execution debugging.

---



## Failure Handling Principles

The architecture follows the following principles.

- Fail fast before business state changes.
- Verify before committing business truth.
- Never hide failures.
- Never silently recover by guessing.
- Never continue from an invalid execution state.
- Every failure produces structured diagnostics.
- Every failure terminates in a well-defined execution state.
- Business correctness always has higher priority than successful completion.

---



## Architectural Summary

The system is intentionally designed so that failures affect execution rather than business correctness.

Execution may fail.

Planning may fail.

Infrastructure may fail.

Response generation may fail.

Business correctness must never fail.

This separation allows the application to remain trustworthy even when parts of the execution lifecycle encounter unexpected conditions.

## 6.12 Runtime Rules

The following runtime rules govern every execution performed by the Global Orchestrator.

Unlike implementation guidelines, these rules are architectural invariants.

Every implementation of the Global Orchestrator must satisfy them regardless of programming language, agent framework or deployment platform.

Violating any runtime rule constitutes an architectural defect rather than an implementation choice.

---



## Rule 1 — Every Execution Begins With Reasoning

No business capability may execute until the owner's business intent has been understood and transformed into executable business objectives.

Natural language must never directly trigger deterministic execution.

---



## Rule 2 — Every Objective Has Exactly One Owner

Every business objective must be owned by exactly one Business Capability.

Shared ownership is prohibited.

Business Capabilities may collaborate through the Global Orchestrator but never jointly own the same objective.

This preserves clear responsibility boundaries throughout the application.

---



## Rule 3 — Business Capabilities Are Autonomous

Business Capabilities remain independent software subsystems.

They must never:

- invoke another capability,
- bypass the Global Orchestrator,
- modify another capability's business state,
- enforce another capability's business rules.

Every capability remains responsible only for the business domain it owns.

---



## Rule 4 — Deterministic Execution Is Mandatory

Once the Global Orchestrator has produced an execution plan, deterministic software becomes responsible for execution.

The language model must never directly execute business operations.

Business correctness must never depend upon probabilistic behaviour.

---



## Rule 5 — Every Business Operation Is Verified

No business operation is considered complete until deterministic verification has confirmed that the intended business objective has been achieved.

Verification establishes business truth.

Execution alone does not.

---



## Rule 6 — Verified Business Facts Become The Only Source Of Truth

Every subsequent reasoning cycle begins from verified business facts.

The orchestrator must never reason from:

- previous responses,
- assumptions,
- cached model knowledge,
- inferred business state.

Verified business facts become the sole authoritative evidence available to the reasoning engine.

---



## Rule 7 — Every Response Must Be Grounded

Every factual statement communicated to the owner must be directly supported by verified business facts.

Unsupported claims, inferred information and hallucinated business state are prohibited.

Grounding is a runtime requirement rather than a prompt engineering technique.

---



## Rule 8 — Clarification Takes Priority Over Assumption

Whenever sufficient information does not exist to safely continue execution, the orchestrator must suspend execution and request clarification.

Execution must never continue by replacing missing business information with probabilistic inference.

---



## Rule 9 — Execution Is Observable

Every execution must produce sufficient structured information to reconstruct:

- planning,
- capability participation,
- execution progression,
- verification,
- failures,
- termination.

The complete execution lifecycle must remain observable after execution has finished.

---



## Rule 10 — Stable Termination Is Mandatory

Every orchestration cycle must terminate in exactly one stable terminal state.

Valid terminal states include:

- Successfully completed.
- Waiting for clarification.
- Safely refused.
- Recoverable system failure.
- Non-recoverable system failure.

The orchestration loop must never terminate while execution remains indeterminate.

---



## Rule 11 — Architectural Boundaries Are Never Violated

The Global Orchestrator must never:

- perform business operations,
- modify business persistence,
- enforce business rules,
- calculate business correctness,
- directly invoke deterministic tools.

Business Capabilities must never:

- coordinate cross-domain collaboration,
- communicate directly with other capabilities,
- generate owner-facing responses.

Each subsystem must remain within its defined responsibility boundary.

---



## Rule 12 — Deterministic Software Always Owns Business Correctness

Adaptive reasoning determines **what should happen**.

Deterministic software proves **what actually happened**.

Business correctness therefore remains independent of language model behaviour.

This rule represents the fundamental architectural principle governing the entire application.

---



## Architectural Summary

Collectively, these runtime rules define the execution contract of the Global Orchestrator.

Every reasoning cycle, execution plan, business capability, verification step and response generated by the system must satisfy these rules.

They provide a stable constitutional foundation upon which every future capability, feature and architectural extension can be implemented without compromising the integrity of the overall system.

## 6.13 Observability

Observability provides complete visibility into every orchestration cycle performed by the application.

Its purpose is not merely to record runtime events.

Its purpose is to reconstruct the complete reasoning and execution history of every business request.

Given any completed execution, an engineer should be able to answer:

- What business intent did the system identify?
- Which business objectives were created?
- Why were particular Business Capabilities selected?
- Which capabilities participated?
- Which business operations were executed?
- What verified business facts were produced?
- Which verification gates executed?
- Why did the orchestrator choose its next action?
- How did execution terminate?

The objective of observability is therefore explainability rather than logging.

---



## Observability Philosophy

The application is architecturally divided into deterministic execution and adaptive reasoning.

Both must be observable.

Deterministic software must expose:

- what executed,
- what changed,
- what was verified.

Adaptive reasoning must expose:

- what was understood,
- what was planned,
- what decisions were made,
- why those decisions were made.

Together these form the complete execution history.

---



## Observability Layers

The architecture exposes observability at five independent layers.

### Layer 1 — Request Lifecycle

Captures the overall lifecycle of every request.

Includes:

- Correlation Identifier
- Store Identifier
- Conversation Identifier
- Request Timestamp
- Execution Duration
- Final Execution Status

This layer provides the high-level execution timeline.

---



### Layer 2 — Orchestration Decisions

Captures every reasoning decision performed by the Global Orchestrator.

For every orchestration cycle the following information is recorded.

- Business Intent
- Business Objectives
- Selected Business Capabilities
- Execution Plan
- Decision Outcome

Examples:

- Continue Execution
- Re-plan
- Clarification Required
- Generate Response
- Terminate

The objective is to reconstruct the orchestrator's reasoning path.

---



### Layer 3 — Capability Execution

Each Business Capability records its own execution history.

This includes:

- Capability Identifier
- Assigned Business Objective
- Business Operations Executed
- Execution Duration
- Objective Status
- Clarification Requests
- Verification Result

Capability observability remains independent from orchestration observability.

This preserves subsystem ownership.

---



### Layer 4 — Verification

Every verification layer records its outcome.

Plan Verification records:

- Plan Accepted
- Plan Rejected
- Verification Diagnostics

Business Verification records:

- Preconditions
- Postconditions
- Verified Business Facts
- Verification Status

Faithfulness Verification records:

- Response Accepted
- Response Rejected
- Unsupported Claims
- Regeneration Count

Verification therefore becomes fully observable.

---



### Layer 5 — Runtime Infrastructure

Infrastructure events are recorded independently of business execution.

Examples include:

- SQLite operations
- Cloudflare runtime events
- Telegram communication
- LLM requests
- External service latency
- Document generation
- Runtime failures

This layer supports operational diagnostics without polluting business observability.

---



## Correlation Model

Every event generated by the application belongs to exactly one execution context.

The Correlation Identifier follows the request throughout the complete execution lifecycle.

```text
Telegram Message

↓

Correlation ID Created

↓

Execution Context

↓

Orchestration

↓

Capability Execution

↓

Verification

↓

Response

↓

Complete Execution History
```

Using a single Correlation Identifier allows engineers to reconstruct an entire execution from one identifier.

---



## Observability Rules

The following architectural rules always apply.

- Every execution must produce structured events.
- Every event belongs to exactly one Correlation Identifier.
- Every Business Capability records its own execution.
- Every verification layer records its outcome.
- Every reasoning decision is observable.
- Every terminal state is recorded.
- No business state changes occur without corresponding observability events.

---



## Production Diagnostics

The observability architecture enables engineers to answer production questions such as:

- Why did the orchestrator choose this capability?
- Why was clarification requested?
- Which capability rejected the objective?
- Which business rule prevented execution?
- Which verification gate failed?
- Why was the response regenerated?
- Which objective remained incomplete?
- Why did execution terminate?

These questions can be answered without reproducing the execution.

---



## Architectural Principle

Observability is treated as a first-class architectural capability rather than an operational afterthought.

The application is therefore designed so that every business request produces a complete, structured and explainable execution history.

This execution history allows engineers to understand not only **what** the system did, but **why** it did so, making the behaviour of an adaptive AI system as diagnosable as a deterministic software application.

## 6.14 Test Strategy

The purpose of the test strategy is not simply to verify that the application functions correctly.

Its purpose is to demonstrate that every architectural guarantee established throughout this document remains true under both normal and abnormal operating conditions.

Testing is therefore treated as architectural validation rather than feature verification.

Every significant architectural decision must have corresponding evidence proving that it behaves as intended.

---



## Testing Philosophy

The application is composed of independent software components collaborating through deterministic execution and adaptive reasoning.

Testing therefore validates both:

- correctness of individual components, and
- correctness of collaboration between components.

No component is considered complete until it has been validated independently and then validated again as part of the complete runtime.

---



## Architectural Validation Pyramid

The validation strategy progresses through four increasingly realistic stages.

```text
Architecture Invariants

↓

Component Validation

↓

Subsystem Integration

↓

Production End-to-End Validation
```

Each stage builds confidence before progressing to the next.

---



## Stage 1 — Architectural Invariant Validation

The first stage validates the architectural principles themselves.

These tests remain independent of implementation details.

Examples include:

### Responsibility Ownership

Verify that every business objective is owned by exactly one Business Capability.

---



### Capability Independence

Verify that Business Capabilities never invoke one another directly.

---



### Deterministic Execution

Verify that all business state changes occur exclusively through deterministic Business Capabilities.

---



### Verification Gates

Verify that execution cannot bypass:

- Plan Verification,
- Business Verification,
- Faithfulness Verification.

---



### Grounded Responses

Verify that every factual statement returned to the owner is traceable to verified business facts.

---



### Stable Termination

Verify that every orchestration cycle reaches exactly one valid terminal state.

These tests validate the architecture itself rather than individual features.

---



## Stage 2 — Component Validation

Each software component is validated independently.

Components include:

- Worker & Telegram Adapter
- Execution Manager
- Conversation Manager
- Global Orchestrator
- Capability Registry
- Business Capabilities
- Persistence Layer
- Artifact Generation

Each component is tested in isolation using controlled inputs and expected outputs.

Validation focuses exclusively on the responsibilities owned by that component.

---



## Stage 3 — Business Capability Validation

Each Business Capability is validated independently as an autonomous business subsystem.

Validation includes:

- objective planning,
- internal orchestration,
- dependency resolution,
- business rule enforcement,
- verification,
- production of verified business facts.

Each capability is treated as a black-box domain expert.

The Global Orchestrator is intentionally excluded from these tests.

---



## Stage 4 — Collaboration Validation

Subsystem interaction is validated after individual components have been proven correct.

Scenarios include:

- multiple Business Capabilities participating in one request,
- replanning after execution,
- clarification workflows,
- conditional capability participation,
- sequential capability collaboration,
- recursive orchestration.

The objective is to validate collaboration rather than individual functionality.

---



## Stage 5 — Failure Validation

Every failure classification defined within the architecture is intentionally exercised.

Examples include:

Planning Failures

- invalid execution plan,
- missing Business Capability,
- unsatisfied dependencies.

Business Failures

- insufficient inventory,
- missing customer,
- selling below cost,
- invalid business rule.

Infrastructure Failures

- persistence unavailable,
- Telegram unavailable,
- LLM unavailable.

Verification Failures

- invalid execution plan,
- failed Business Verification,
- failed Faithfulness Verification.

Validation confirms that failures preserve business correctness.

---



## Stage 6 — Production End-to-End Validation

Every completed software component is deployed immediately after implementation.

Validation is performed against the live Cloudflare deployment rather than a local development environment.

Every component therefore demonstrates:

- production deployment,
- runtime integration,
- observability,
- execution correctness,
- recovery behaviour.

The objective is continuous architectural validation throughout development rather than only after implementation has completed.

---



## Evaluation Scenarios

Representative execution scenarios include:

### Single Capability

One business objective.

One Business Capability.

Successful completion.

---



### Multi-Capability Collaboration

One business request.

Multiple Business Capabilities.

Dynamic runtime collaboration.

---



### Clarification

Execution pauses.

Owner responds.

Execution resumes correctly.

---



### Replanning

Execution produces new verified business facts.

The orchestrator modifies the execution plan.

Execution continues successfully.

---



### Verification Failure

Execution completes.

Faithfulness Verification rejects the response.

Response regenerates without repeating business execution.

---



### Infrastructure Failure

External dependency becomes unavailable.

Business correctness remains preserved.

Execution terminates safely.

---



## Success Criteria

The architecture is considered validated only when all of the following have been demonstrated.

- Every component functions independently.
- Every Business Capability satisfies its assigned objectives.
- Collaboration behaves correctly.
- Verification gates cannot be bypassed.
- Failures preserve business correctness.
- Responses remain grounded.
- Observability reconstructs complete executions.
- Every production scenario behaves consistently after deployment.

---



## Architectural Principle

Testing is not performed to prove that the application works.

Testing is performed to prove that the architectural guarantees established throughout this document continue to hold under every execution path.

The implementation is therefore validated against the architecture rather than the architecture being inferred from the implementation.

## 6.15 Acceptance Criteria

The Global Orchestrator is considered complete only when its externally observable behaviour demonstrates that it satisfies every architectural responsibility defined throughout this document.

Acceptance is based upon architectural behaviour rather than implementation details.

The programming language, framework and internal implementation are not considered acceptance criteria.

Only the observable behaviour of the orchestration runtime is evaluated.

---



## Functional Acceptance

The Global Orchestrator must demonstrate the ability to:

- Understand business intent from natural language.
- Derive one or more business objectives.
- Select the appropriate Business Capabilities.
- Produce a valid execution plan.
- Delegate objectives without violating ownership boundaries.
- Coordinate collaboration between multiple Business Capabilities.
- Re-plan when execution changes the business situation.
- Request clarification when insufficient business information exists.
- Generate a grounded natural-language response after successful execution.

---



## Architectural Acceptance

The implementation must demonstrate that:

- Business Capabilities remain completely independent.
- The Global Orchestrator never performs business operations.
- Deterministic software owns business execution.
- Every business objective has exactly one owning Business Capability.
- Collaboration occurs only through the Global Orchestrator.
- Business correctness remains independent of language model behaviour.

---



## Verification Acceptance

The orchestration runtime must demonstrate that:

- Every execution plan passes Plan Verification.
- Every Business Capability performs Business Verification.
- Every response passes Faithfulness Verification.
- Verified Business Facts become the only evidence used during subsequent reasoning.
- No verification layer can be bypassed.

---



## Failure Acceptance

The implementation must demonstrate that:

- Planning failures never modify business state.
- Business failures preserve deterministic business correctness.
- Infrastructure failures terminate safely.
- Verification failures prevent incorrect responses.
- Every failure produces structured diagnostics.
- Every execution terminates in a valid architectural state.

---



## Observability Acceptance

The implementation must demonstrate that engineers can reconstruct an entire orchestration cycle from production telemetry.

This includes:

- identified business intent,
- business objectives,
- capability delegation,
- execution progression,
- verification outcomes,
- runtime decisions,
- failure diagnostics,
- final execution state.

The orchestration lifecycle must remain completely explainable after execution has completed.

---



## Runtime Acceptance

The implementation must demonstrate that:

- reasoning and deterministic execution remain separated,
- execution adapts to changing runtime conditions,
- clarification pauses and later resumes execution correctly,
- replanning occurs only from verified business facts,
- responses remain fully grounded.

---



## Production Acceptance

The Global Orchestrator is accepted only after successful execution within the production Cloudflare deployment.

Acceptance must be demonstrated using the deployed Telegram bot rather than local execution.

Production validation must confirm:

- Telegram webhook delivery reaches the Cloudflare Worker.
- The Worker correctly routes requests into the appropriate Durable Object instance.
- Execution state persists correctly across requests.
- Multi-turn conversations continue correctly after independent requests.
- Orchestration, verification and observability remain functional within the deployed environment.
- Structured logs and execution traces are visible through Cloudflare observability tooling.
- Production behaviour matches the architectural guarantees defined in this document.

---



## Acceptance Summary

The Global Orchestrator is accepted only when it demonstrates that adaptive reasoning, deterministic execution, verification, collaboration, failure handling and production deployment collectively satisfy the architectural contract established throughout this document.

Acceptance therefore represents validation of the architecture itself rather than validation of any specific implementation.

## 6.16 End-to-End Validation

The purpose of End-to-End Validation is to demonstrate that the complete system behaves correctly within its intended production environment.

Validation is not performed to verify individual software components.

Individual components have already been validated independently throughout implementation.

End-to-End Validation verifies that all components collaborate correctly after deployment and collectively satisfy the architectural guarantees established throughout this document.

---



### **⚠️ CRITICAL ENGINEERING PRINCIPLE — PRODUCTION-FIRST DEVELOPMENT**

**This system must be developed for the production environment from the very beginning.**

**Do not develop a "working local prototype" with the intention of making it production-ready later.**

That approach delays the discovery of deployment constraints until the end of the project, when architectural corrections become expensive, risky and time-consuming.

Instead, every software component must be implemented against its actual production runtime.

For this project, the production runtime is:

- Cloudflare Workers
- Cloudflare Durable Objects
- Cloudflare SQLite Storage
- Telegram Bot Webhooks
- Gemini API
- Cloudflare production networking and execution model

Every architectural decision, every software component and every integration must be validated within this production environment as soon as that component is implemented.

The production environment is treated as the primary development environment.

Local development exists only to accelerate iteration, never to define the architecture.

This approach ensures that deployment constraints, runtime behaviour, persistence characteristics, execution limits and infrastructure interactions are continuously validated throughout development rather than being discovered only during final deployment.

---



## Validation Philosophy

Every major software component follows the same engineering lifecycle.

```text
Design

↓

Implement

↓

Component Testing

↓

Deploy To Cloudflare

↓

Production End-to-End Validation

↓

Accept Component

↓

Begin Next Component
```

No component is considered complete until it has been successfully deployed and validated in the production Cloudflare environment.

---



## Continuous Production Validation

Development proceeds incrementally.

Each completed software component is immediately deployed and validated before implementation of the next component begins.

This provides continuous confidence that:

- deployment remains healthy,
- production integrations remain functional,
- architectural assumptions remain valid,
- execution behaviour matches the intended design.

Production validation therefore becomes a continuous engineering activity rather than a final project milestone.

---



## Production Validation Scope

Every deployed component must be validated against the production infrastructure.

Validation includes:

### Cloudflare Runtime

- Worker deployment succeeds.
- Durable Objects initialize correctly.
- Durable Object routing behaves correctly.
- Persistent SQLite storage behaves as expected.
- Runtime lifecycle matches architectural assumptions.

---



### Telegram Integration

Validate:

- webhook registration,
- webhook delivery,
- request authentication,
- request routing,
- multi-message conversations,
- retry behaviour,
- duplicate update handling.

The production Telegram bot becomes the primary validation interface.

---



### Agent Runtime

Validate:

- orchestration loop,
- capability delegation,
- execution engine,
- verification gates,
- clarification workflow,
- replanning behaviour,
- response generation.

All execution paths must operate correctly within the production runtime.

---



### Persistence

Validate:

- conversation persistence,
- business persistence,
- owner preferences,
- inventory state,
- khata,
- draft bills,
- recovery after Worker restart,
- recovery after Durable Object activation.

Persistent business state must survive independent execution sessions.

---



### Observability

Validate that production telemetry provides complete visibility into:

- orchestration,
- capability execution,
- verification,
- failures,
- response generation,
- execution termination.

Every production execution must be reconstructable from observability data.

---



### Failure Validation

Production validation intentionally exercises failure scenarios.

Examples include:

- insufficient inventory,
- duplicate Telegram delivery,
- invalid business requests,
- clarification workflow,
- failed verification,
- external service failures,
- deployment restarts.

The objective is to verify that business correctness is preserved under production failures.

---



## Component Acceptance Checklist

Every software component must satisfy the following checklist before implementation proceeds to the next component.

- Component responsibilities implemented.
- Component tests passing.
- Cloudflare deployment successful.
- Production integration verified.
- Observability confirmed.
- Failure scenarios exercised.
- Architectural invariants preserved.
- End-to-end production validation successful.

Only then is the component considered complete.

---



## Final System Validation

Once all components have individually satisfied production acceptance, the complete system is validated as one integrated application.

Validation includes the complete assessment workflow.

Representative scenarios include:

- Receiving stock.
- Creating and editing a draft bill.
- Finalizing a bill.
- Oversell prevention.
- Khata lifecycle.
- Daily summary.
- PDF invoice generation.
- PPTX analysis generation.
- Owner preference persistence.
- Multi-turn clarification.
- Cross-capability collaboration.
- Runtime replanning.
- Verification gate enforcement.
- Faithfulness verification.
- Recovery from expected failures.

The objective is not merely to demonstrate successful execution.

The objective is to demonstrate that the complete architecture behaves exactly as designed under realistic production conditions.

---



## Engineering Principle

A production deployment is not the final stage of development.

It is the environment in which development is continuously validated.

Every software component earns trust by proving itself in production before additional complexity is introduced.

This production-first engineering approach minimizes integration risk, exposes architectural issues early and ensures that the final demonstration reflects software that has been continuously validated in the environment for which it was designed.

## 6.17 Runtime Architecture

The Global Orchestrator is implemented as a Cloudflare Agent (with CLoudflare agent SDK which is a runtime + harness, unlike other sdk whick solves for harness only) executing inside the Store Durable Object.

Unlike traditional backend services, the Global Orchestrator is not a long-running server process. It is instantiated as part of each incoming execution request, performs adaptive reasoning for that execution and then terminates. The Durable Object provides the persistent execution environment while the Global Orchestrator provides the adaptive reasoning capability.

The orchestrator itself owns no persistent business state.

Instead, persistent business state remains inside the Store Durable Object through SQLite persistence. The orchestrator consumes verified business facts, reasons about them, delegates work to Business Capabilities and produces execution plans without directly modifying persistent data.

This separation preserves deterministic business correctness while allowing the language model to remain responsible only for adaptive reasoning.

---



## Runtime Technology Stack

The Global Orchestrator is implemented using the following runtime technologies.


| Responsibility       | Technology                            |
| -------------------- | ------------------------------------- |
| Agent Runtime        | Cloudflare Agents SDK                 |
| Language Model       | Gemini 3.5 Flash                      |
| Agent Execution      | Cloudflare Agent Runtime              |
| Structured Outputs   | Native Structured Output Support      |
| Tool Calling         | Cloudflare Agent Tool Interface       |
| Hosting Runtime      | Cloudflare Durable Object             |
| Programming Language | TypeScript                            |
| Persistent Storage   | SQLite attached to the Durable Object |


Each technology has been selected to satisfy a specific architectural responsibility rather than simply because it is available.

---



## Runtime Responsibilities

At runtime the Global Orchestrator is responsible for:

- constructing the execution context,
- understanding business intent,
- planning business objectives,
- selecting Business Capabilities,
- generating execution plans,
- coordinating capability collaboration,
- evaluating execution progress,
- replanning when necessary,
- generating grounded responses.

The orchestrator is intentionally prohibited from:

- modifying business state,
- querying SQLite directly,
- executing business operations,
- enforcing business rules,
- generating business facts.

Those responsibilities remain delegated to deterministic Business Capabilities.

---



## Runtime Lifecycle

For every incoming Telegram message the runtime executes the following lifecycle.

```text
Telegram Update

↓

Cloudflare Worker

↓

Locate Store Durable Object

↓

Create Execution Context

↓

Instantiate Global Orchestrator

↓

Run Orchestration Loop

↓

Coordinate Business Capabilities

↓

Generate Response

↓

Return Response

↓

Execution Terminates
```

The orchestrator exists only for the duration of a single execution cycle.

No execution-specific state survives after the orchestration cycle completes.

Persistent information remains inside the Durable Object.

---



## Runtime Dependencies

The Global Orchestrator depends upon the following runtime components.

### Store Durable Object

Provides:

- execution environment,
- persistent SQLite database,
- store isolation,
- conversation persistence,
- runtime coordination.

---



### Execution Runtime

Provides:

- execution context,
- execution identifiers,
- correlation identifiers,
- orchestration lifecycle management.

---



### Conversation Manager

Provides:

- conversation history,
- clarification state,
- owner preferences,
- active objectives.

The orchestrator consumes conversation context but never owns it.

---



### Capability Registry

Provides:

- capability discovery,
- capability metadata,
- objective-to-capability mapping.

The orchestrator never hardcodes capability implementations.

---



### Business Capabilities

Business Capabilities perform deterministic execution.

The orchestrator coordinates them but never enters their implementation boundaries.

---



## Runtime Isolation

Every Store Durable Object owns an independent runtime.

Consequently:

- one kirana store cannot access another store's data,
- conversations remain isolated,
- execution contexts remain isolated,
- SQLite databases remain isolated,
- orchestration remains isolated.

This isolation is provided naturally by the Durable Object execution model and eliminates the need for distributed locking or multi-tenant synchronization inside the application.

---



## Runtime Principles

The runtime is governed by the following principles.

- Adaptive reasoning remains stateless.
- Persistent business state remains deterministic.
- Every execution begins from verified business facts.
- Every execution terminates after reaching a stable architectural state.
- Runtime components communicate only through well-defined architectural boundaries.
- Business correctness never depends upon the language model.

---



## Architectural Rationale

The Cloudflare execution model closely aligns with the architectural requirements of the application.

Cloudflare Workers provide globally distributed stateless request handling.

Durable Objects provide isolated per-store execution together with colocated SQLite persistence.

The Cloudflare Agents SDK provides the adaptive reasoning runtime required by the Global Orchestrator.

This alignment allows the architecture to preserve clear responsibility boundaries while minimizing distributed systems complexity.

Instead of forcing distributed coordination across multiple servers, every store executes inside its own isolated runtime, allowing the Global Orchestrator to reason over a single, consistent and durable business state throughout the entire orchestration lifecycle.

# Chapter 7 — Business Capability Architecture



## 7.1 Purpose

Business Capabilities represent the business expertise of the application.

Each Business Capability owns one independent business domain and is solely responsible for executing business objectives belonging to that domain.

Examples include:

- Inventory Management
- Billing
- Khata (Credit Ledger)
- Analytics
- Store Configuration

(Note: ARTIFACT GENERATION IS NOT A BUSINESS CAPABILITY, IT IS A COMPONENT USED BY BUSINESS CAPABILITIES IF THEY WANT TO GENERATE AN ARTIFACT IF IT CAN BE GENEREATED)

The purpose of a Business Capability is not simply to execute tools.

Its purpose is to transform a business objective into verified business facts while preserving business correctness.

The Global Orchestrator decides **what** business objective should be achieved.

The Business Capability decides **how** that objective is achieved.

---



## 7.2 Architectural Philosophy

Every Business Capability behaves as an autonomous domain expert.

It owns:

- business knowledge,
- business rules,
- business operations,
- deterministic execution,
- verification,
- business correctness.

The capability deliberately hides its internal implementation from the rest of the application.

Other components never interact with its internal tools directly.

Instead, they interact only through its public objective interface.

This preserves subsystem independence and allows every capability to evolve independently.

---



## 7.3 Responsibility Boundary

The Business Capability owns everything inside its business domain.

It is responsible for:

- understanding the assigned business objective,
- determining the required business operations,
- selecting the appropriate deterministic tools,
- enforcing business rules,
- validating preconditions,
- executing business operations,
- validating postconditions,
- producing verified business facts,
- reporting execution outcomes.

It is **not** responsible for:

- understanding the owner's overall intent,
- coordinating multiple business domains,
- generating conversational responses,
- communicating directly with the owner,
- replanning global execution.

Those responsibilities remain with the Global Orchestrator.

---



## 7.4 Internal Architecture

Every Business Capability follows the same internal execution model.

```text
Assigned Business Objective
            │
            ▼
──────────────────────────────────
Objective Analysis
──────────────────────────────────
            │
            ▼
──────────────────────────────────
Business Operation Planning
──────────────────────────────────
            │
            ▼
──────────────────────────────────
Dependency Resolution
──────────────────────────────────
            │
            ▼
──────────────────────────────────
Tool Selection
──────────────────────────────────
            │
            ▼
──────────────────────────────────
Deterministic Execution
──────────────────────────────────
            │
            ▼
──────────────────────────────────
Business Verification
──────────────────────────────────
            │
            ▼
──────────────────────────────────
Verified Business Facts
──────────────────────────────────
            │
            ▼
Structured Execution Result
```

Every capability follows this lifecycle regardless of the business domain it owns.

Only the business knowledge changes.

The execution philosophy remains identical.

---



## 7.5 Capability Control Loop

Each Business Capability behaves as a small deterministic orchestration engine operating entirely within its own business domain.

For every assigned business objective, the capability executes the following control loop.

### Step 1 — Understand the Business Objective

Interpret the assigned objective in the context of the owned business domain.

No business operations are executed during this stage.

The objective is only analyzed.

---



### Step 2 — Plan Business Operations

Determine the sequence of business operations required to satisfy the objective.

These are business operations rather than software operations.

Example:

Business Objective:

> Finalize Bill

Business Operations:

- Validate draft bill.
- Verify inventory availability.
- Reserve inventory.
- Calculate GST.
- Persist finalized bill.
- Commit inventory deduction.
- Generate Bill if bool is true

---



### Step 3 — Resolve Dependencies

Before any business operation executes, every dependency is validated.

Examples include:

- required product exists,
- customer exists,
- draft bill exists,
- sufficient inventory exists,
- payment information available.

Execution never proceeds until every dependency has been satisfied.

---



### Step 4 — Select Deterministic Tools

The capability selects the deterministic tools required to perform each business operation.

Tools are implementation details of the capability.

The Global Orchestrator never observes or controls this process.

Tool sequencing is entirely owned by the capability.

---



### Step 5 — Execute Business Operations

Business operations execute through deterministic tools.

Every modification of business state occurs exclusively through these tools.

The language model never modifies business state directly.

---



### Step 6 — Verify Business Correctness

After execution completes, deterministic verification confirms that the assigned business objective has actually been achieved.

Verification includes:

- precondition validation,
- postcondition validation,
- invariant preservation,
- resulting business state verification.

Business correctness is established only after successful verification.

---



### Step 7 — Produce Verified Business Facts

The capability never returns implementation details.

Instead, it returns structured business evidence.

This includes:

- objective status,
- verified business facts,
- clarification requests,
- business diagnostics,
- execution diagnostics.

These verified facts become the only information consumed by the Global Orchestrator during the next reasoning cycle.

---



## 7.6 Capability Contract

Every Business Capability implements the same execution contract.

### Input

- Business Objective
- Execution Context
- Conversation Context
- Verified Business Facts relevant to the objective



### Output

- Objective Status
- Verified Business Facts
- Clarification Request (if required)
- Execution Diagnostics
- Failure Diagnostics (if applicable)

This common contract allows the Global Orchestrator to coordinate any capability without understanding its internal implementation.

---



## 7.7 Architectural Principles

Every Business Capability must satisfy the following principles.

- Own exactly one business domain.
- Never communicate directly with another capability.
- Never modify another capability's business state.
- Never expose internal tools.
- Never bypass deterministic verification.
- Never return unverified business information.
- Never communicate directly with the owner.
- Always preserve business invariants.
- Always return structured execution results.

---



## 7.8 Runtime Lifecycle

Every Business Capability follows the same runtime lifecycle.

```text
Receive Objective

↓

Understand Objective

↓

Plan Business Operations

↓

Resolve Dependencies

↓

Select Tools

↓

Execute

↓

Verify

↓

Produce Verified Business Facts

↓

Return Structured Result
```

This lifecycle forms the constitutional execution model for every capability implemented within the application.

---



## 7.9 Architectural Summary

Business Capabilities are deterministic domain experts.

The Global Orchestrator coordinates **between** business domains.

Business Capabilities coordinate **within** their own business domain.

This separation establishes a clear architectural hierarchy.

- The Global Orchestrator owns adaptive reasoning.
- Business Capabilities own deterministic business execution.
- Tools implement individual business operations.
- Verification establishes business truth.

As a result, every business request progresses through a hierarchy of responsibility rather than a monolithic agent, allowing the system to remain modular, testable, extensible and architecturally consistent as new business domains are introduced.

# Chapter 8 — Inventory Capability



## Purpose

The Inventory Capability owns the complete inventory state of the store.

Its responsibility is to maintain the correctness of every product available for sale.

The capability is the sole authority responsible for inventory data.

No other Business Capability may modify inventory directly.

Billing, Analytics and other capabilities interact with inventory only through this capability.

---



## Business Objectives

The Inventory Capability is responsible for satisfying the following business objectives.

- Register newly received stock.
- Register a new product.
- Maintain accurate inventory quantities.
- Answer inventory-related business questions.
- Prevent overselling.
- Detect low-stock situations.
- Produce verified inventory facts for other Business Capabilities.

---



# Tool 1 — Register Inventory



## Why this tool exists

This tool is responsible for introducing inventory into the store.

From a business perspective there are only two possibilities.

- Existing SKU receives additional stock.
- New SKU is introduced into the inventory.

Both represent the same business operation.

The inventory owned by the store has increased.

Therefore both operations belong to one tool.

---



### Business Rules

The capability must determine whether the product already exists.

If the product already exists:

- inventory quantity increases,
- cost price may be updated,
- selling price may be updated,
- reorder level may be updated if supplied.

If the product does not exist:

- create the SKU,
- persist all inventory metadata,
- initialize inventory quantity.

The tool must never create duplicate products.

Product identity must remain unique.

---



### Verification Gates

Before execution verify:

- product identity resolved,
- quantity is positive,
- required inventory information available.

After execution verify:

- inventory persisted,
- inventory quantity increased correctly,
- product metadata stored correctly,
- resulting inventory matches expected inventory.

---



### Failure Handling

Fail when:

- product cannot be identified,
- inventory quantity invalid,
- mandatory information missing,
- persistence fails.

Return structured diagnostics.

No inventory changes are committed.

---



# Tool 2 — Query Inventory



## Why this tool exists

This tool provides grounded inventory information.

Every inventory question answered by the application originates from this tool.

Examples include:

- How much sugar is left?
- What is running out?
- What is the inventory of Maggi?

The LLM never invents inventory values.

Inventory facts always originate from deterministic storage.

---



### Business Rules

The tool never modifies inventory.

It only returns verified inventory facts.

If multiple products match the owner's request, ambiguity must be reported.

The tool never guesses the intended SKU.

---



### Verification Gates

Before execution verify:

- query understood,
- product resolution successful (if applicable).

After execution verify:

- returned inventory exists,
- values originate from persistence,
- response contains verified inventory facts.

---



### Failure Handling

Fail when:

- product cannot be found,
- multiple products match,
- persistence unavailable.

Return structured clarification or diagnostics.

---



# Tool 3 — Allocate Inventory



## Why this tool exists

This tool is the only mechanism through which inventory may be reduced.

Its purpose is to safely participate in the billing workflow while preserving inventory correctness.

Inventory is never deducted directly by Billing.

Billing requests inventory allocation.

Inventory decides whether the request is valid.

This makes Inventory the owner of oversell protection.

---



### Business Rules

The requested product must exist.

Requested quantity must be available.

Inventory must never become negative.

Inventory modifications must be atomic.

Concurrent requests must not corrupt inventory.

Draft bills must not permanently reduce inventory.

Finalized bills commit the inventory allocation.

Cancelled bills release any reserved inventory.

Inventory deductions always originate from finalized business transactions.

---



### Verification Gates

Before execution verify:

- product exists,
- requested quantity valid,
- sufficient inventory available,
- inventory not already allocated,
- execution idempotency.

After execution verify:

- inventory reduced correctly,
- reservation committed correctly,
- inventory never negative,
- resulting inventory persisted,
- resulting inventory equals expected inventory.

---



### Failure Handling

Fail when:

- insufficient inventory,
- product missing,
- duplicate execution,
- concurrent modification detected,
- persistence failure.

Execution immediately terminates.

No partial inventory deduction is permitted.

Structured diagnostics are returned to the Global Orchestrator.

---



## Architectural Principles

The Inventory Capability is the single source of truth for inventory.

Every inventory fact consumed elsewhere in the application must originate from this capability.

No other capability may:

- modify inventory,
- infer inventory,
- bypass inventory validation,
- bypass oversell protection.

Business correctness is therefore centralized within one deterministic subsystem.

This preserves one of the fundamental architectural principles established throughout this document:

**Only the owning Business Capability may modify its business domain.**

# Chapter 9 — Billing Capability



## Purpose

The Billing Capability owns the complete lifecycle of a bill.

Its responsibility is to transform a customer's purchase into a verified financial transaction while preserving business correctness.

The Billing Capability is the sole owner of:

- draft bills,
- finalized bills,
- GST computation,
- payment recording,
- bill persistence.

No other Business Capability may modify bill state directly.

Inventory participates only by validating and committing inventory.

Khata participates only when credit payments are involved.

The Billing Capability remains the owner of the transaction itself.

---



## Business Objectives

The Billing Capability is responsible for satisfying the following business objectives.

- Create and maintain draft bills.
- Support multi-turn bill construction.
- Support bill modification before finalization.
- Finalize bills.
- Calculate GST correctly.
- Record payment information.
- Produce verified billing facts for downstream capabilities.

---



# Tool 1 — Manage Draft Bill



## Why this tool exists

A bill is constructed over multiple conversational turns.

This tool owns the entire lifecycle of the draft bill until the owner decides to finalize it.

It supports:

- creating a new draft,
- adding products,
- removing products,
- modifying quantities,
- changing payment method,
- updating customer information.

The draft remains mutable.

No permanent business state outside the draft is modified.

---



### Business Rules

Only one active draft bill may exist per conversation.

Products added to the draft must exist in inventory.

The Billing Capability must never invent products, prices or GST values.

Inventory quantities are referenced but not permanently deducted.

Draft modifications remain reversible.

The draft bill persists across multiple conversation turns.

---



### Verification Gates

Before execution verify:

- active draft exists or can be created,
- referenced products exist,
- quantities are valid,
- product information originates from Inventory.

After execution verify:

- draft updated successfully,
- totals recalculated,
- GST recalculated,
- draft persisted correctly.

---



### Failure Handling

Fail when:

- product cannot be resolved,
- requested quantity invalid,
- draft unavailable,
- persistence failure.

Return structured diagnostics.

No permanent business state is modified.

---



# Tool 2 — Finalize Bill



## Why this tool exists

This tool converts a draft bill into a completed business transaction.

It is the only tool permitted to permanently commit a sale.

It coordinates with other Business Capabilities while remaining the owner of the billing objective.

---



### Business Rules

The draft bill must exist.

The draft must contain at least one product.

Inventory allocation must succeed before finalization.

GST must be calculated per item.

CGST and SGST must be computed correctly.

Payment details must be recorded.

If payment type is Khata, the Khata Capability must successfully record the credit before the bill is committed.

The bill must be persisted exactly once.

Inventory must only be committed once.

The operation must be idempotent.

## If the business objective requests an invoice artifact, the tool shall generate the GST-compliant PDF invoice after successful bill finalization. The PDF is generated from the verified bill data, stored by the runtime, and an artifact reference is returned as part of the structured execution result.



### Verification Gates

Before execution verify:

- draft exists,
- draft complete,
- payment information available,
- inventory allocation successful,
- GST computation valid.

After execution verify:

- finalized bill persisted,
- inventory committed,
- payment recorded,
- totals verified,
- GST verified,
- bill identifier generated,
- transaction committed exactly once.

## If an invoice artifact was requested, verify that the PDF was successfully generated, stored and that it represents the finalized verified bill before returning the execution result.



### Failure Handling

Fail when:

- inventory allocation rejected,
- payment validation fails,
- GST computation fails,
- duplicate finalization detected,
- persistence fails,
- concurrent modification detected.

Execution terminates immediately.

No partial transaction is committed.

Structured diagnostics are returned to the Global Orchestrator.

---



# Tool 3 — Query Bill



## Why this tool exists

This tool provides grounded access to persisted billing information.

It supports downstream business capabilities such as:

- PDF invoice generation,
- analytics,
- customer queries.

It never modifies billing state.

---



### Business Rules

Only persisted billing information may be returned.

Draft bills and finalized bills must be clearly distinguished.

Billing information always originates from persistence.

The tool never derives financial information through reasoning.

---



### Verification Gates

Before execution verify:

- requested bill exists,
- bill identifier valid.

After execution verify:

- billing information loaded successfully,
- returned information matches persisted records.

---



### Failure Handling

Fail when:

- bill not found,
- persistence unavailable,
- invalid bill reference.

Return structured diagnostics.

No billing state is modified.

---



## Architectural Principles

The Billing Capability is the single source of truth for every billing transaction.

No other Business Capability may:

- modify bill state,
- calculate GST,
- finalize transactions,
- record payments,
- generate financial totals.

Billing coordinates with Inventory and Khata but never delegates ownership of the business transaction itself.

This preserves the architectural principle that every business domain has exactly one owning Business Capability responsible for deterministic business correctness.

# Chapter 10 — Khata Capability



## Purpose

The Khata Capability owns the complete customer credit ledger of the store.

Its responsibility is to maintain accurate customer credit balances and ensure that every credit transaction is correctly recorded.

The Khata Capability is the sole owner of:

- customer credit accounts,
- credit balances,
- credit ledger entries,
- payment history.

No other Business Capability may directly modify customer credit.

The Billing Capability requests credit recording when a bill is purchased on credit.

The Khata Capability alone determines how customer balances change.

---



## Business Objectives

The Khata Capability is responsible for satisfying the following business objectives.

- Record new credit transactions.
- Record customer payments.
- Maintain customer balances.
- Answer customer balance queries.
- Produce verified credit information for downstream capabilities.

---



# Tool 1 — Manage Khata Transaction



## Why this tool exists

Every modification to a customer's credit account is a ledger transaction.

Whether the balance increases or decreases, the underlying business responsibility is identical.

Maintain the correctness of the customer's ledger.

This tool therefore handles:

- creating a new customer ledger,
- recording credit purchases,
- recording customer repayments.

A customer's balance is never modified outside this tool.

---



### Business Rules

Every transaction must reference a valid customer.

Credit purchases increase the outstanding balance.

Payments decrease the outstanding balance.

Customer balances must always equal the sum of all ledger transactions.

Balances must never become inconsistent with ledger history.

Payments greater than the outstanding balance require explicit confirmation or refusal according to business policy.

Every ledger entry must be permanently persisted.

Every transaction must be idempotent.

---



### Verification Gates

Before execution verify:

- customer identity resolved,
- transaction type identified,
- transaction amount valid,
- customer ledger exists or can be created.

After execution verify:

- ledger entry persisted,
- customer balance recalculated,
- resulting balance verified,
- execution committed exactly once.

---



### Failure Handling

Fail when:

- customer cannot be identified,
- transaction amount invalid,
- duplicate transaction detected,
- persistence failure,
- business rule violation.

Return structured diagnostics.

No partial ledger modification is committed.

---



# Tool 2 — Query Khata



## Why this tool exists

This tool provides grounded access to customer credit information.

It supports requests such as:

- What is Ramesh's balance?
- Show customer credit.

The tool never modifies customer balances.

It only returns verified ledger information.

---



### Business Rules

The customer must exist.

Balances are always calculated from persisted ledger information.

The tool never estimates or infers balances.

Only verified credit information may be returned.

---



### Verification Gates

Before execution verify:

- customer identified,
- customer ledger exists.

After execution verify:

- balance calculated successfully,
- returned balance matches persisted ledger,
- ledger history available if requested.

---



### Failure Handling

Fail when:

- customer not found,
- ledger unavailable,
- persistence failure.

Return structured diagnostics.

No business state is modified.

---



## Architectural Principles

The Khata Capability is the single source of truth for customer credit.

No other Business Capability may:

- modify customer balances,
- create ledger entries,
- calculate outstanding credit,
- infer customer debt.

Billing may request that a credit transaction be recorded, but only the Khata Capability may determine and persist the resulting customer balance.

This preserves deterministic ownership of the credit ledger and ensures that customer financial information remains internally consistent throughout the application.

# Chapter 11 — Analytics Capability



## Purpose

The Analytics Capability owns the business intelligence of the store.

Unlike the other Business Capabilities, Analytics performs no business transactions.

Its responsibility is to transform verified operational data into business metrics, summaries and insights.

Analytics never modifies business state.

Instead, it observes the verified business facts produced by the operational capabilities and derives meaningful business information from them.

Since Analytics consists of only one cohesive business responsibility, it does not require an internal agent.

The capability is implemented as a single deterministic tool invoked directly by the Global Orchestrator.

No secondary planning or orchestration occurs inside this capability.

---



## Business Objectives

The Analytics Capability is responsible for:

- Producing daily business summaries.
- Producing business metrics.
- Producing business insights.
- Producing weekly sales analysis.
- Generating analytical presentation artifacts when requested.

---



# Tool — Generate Analytics



## Why this tool exists

The purpose of this tool is to transform verified business records into verified business intelligence.

The tool supports requests such as:

- Today's sales.
- Close the day.
- Weekly sales analysis.
- Top-selling products.
- GST collected.
- Payment distribution.
- Stock health.

When requested, the same tool also generates a PowerPoint presentation containing the verified analytical results.

The presentation is simply another representation of the same verified business information.

No separate Business Capability is responsible for document generation.

---



### Business Rules

The tool must only use verified operational business data.

It must never estimate business metrics.

It must never invent analytical conclusions.

Every analytical result must be traceable to persisted business records.

The requested reporting period must be explicitly identified.

If a presentation artifact is requested, it must be generated only after the analytical results have been successfully verified.

The generated presentation must represent exactly the verified analytical information.

---



### Verification Gates

Before execution verify:

- reporting period identified,
- sufficient business history exists,
- required operational data available.

After execution verify:

- analytical calculations completed successfully,
- metrics internally consistent,
- insights supported by calculated metrics,
- analytical results traceable to verified business records.

If a presentation artifact was requested:

- verify that the PPTX was successfully generated,
- verify that it represents the verified analytical results,
- verify that the artifact has been stored successfully,
- return the artifact reference within the structured execution result.

---



### Failure Handling

Fail when:

- reporting period cannot be determined,
- insufficient business data exists,
- persistence unavailable,
- analytical computation fails,
- presentation generation fails.

Return structured diagnostics.

No operational business state is modified.

---



## Architectural Principles

Analytics is intentionally implemented without an internal agent.

The capability contains only one deterministic business responsibility.

Introducing an additional planning layer would increase architectural complexity without providing additional reasoning capability.

The Global Orchestrator therefore invokes the Generate Analytics then the capability just invokes the tool directly without using an business capability orchestrator.

The tool produces verified analytical results and, when requested, generates the corresponding presentation artifact before returning a structured execution result to the Global Orchestrator.



## Articats are never sent to the orchestrator , instead they are told as an artificat is genreater and it is present in the state, the llm will answer like (bill is attached, etc) since the tool own the business truth the artifacts are tru and we just attch them to the telegram message.

# Chapter 12 — Conversation Manager & State Reconstruction



## Purpose

The Conversation Manager is responsible for reconstructing the conversational and execution context required for every orchestration cycle.

Unlike traditional long-running applications, Cloudflare Durable Objects are not assumed to remain continuously active. A Durable Object may be created, hibernated or evicted at any time.

Therefore, the responsibility of the Conversation Manager is not to maintain state in memory, but to guarantee that every incoming request can reconstruct the correct execution context from persisted state.

The Conversation Manager owns:

- Conversation State
- Pending Execution State
- Owner Preferences
- Context Assembly

Business state remains owned by the corresponding Business Capabilities.

---



## Architectural Philosophy

The application never assumes that runtime memory exists.

Runtime memory is treated only as a temporary execution cache.

The persistent SQLite storage attached to the Durable Object is the authoritative source of conversational state.

For every incoming request, the Conversation Manager reconstructs the required execution context from persisted state, executes one orchestration cycle and persists any updated state before the request completes.

The system therefore becomes independent of Durable Object lifetime.

Whether the Durable Object has existed for one second or one week produces identical behaviour.

---



## State Ownership

The Conversation Manager owns only conversational state.

Business Capabilities own business state.

This separation ensures that conversational continuity and business correctness evolve independently.

The Conversation Manager owns:

### Conversation State

Represents the current conversational context.

Examples include:

- recent conversation references,
- active clarification,
- conversational metadata,
- current conversation identifier.

Conversation State exists only to help interpret future user messages.

It never contains business truth.

---



### Pending Execution State

Represents execution that has not yet reached a terminal state.

Examples include:

- draft bill currently being constructed,
- clarification awaiting user response,
- suspended orchestration,
- pending business objectives.

Pending Execution State allows execution to resume correctly across independent Telegram messages.

---



### Owner Preferences

Represents persistent behavioural preferences supplied by the owner.

Examples include:

- default payment method,
- preferred atta brand,
- shop name,
- GSTIN,
- invoice preferences.

These preferences survive:

- Worker restarts,
- Durable Object activation,
- new conversations,
- application restarts.

Preferences exist independently of conversation history.

---



## State Reconstruction

Every incoming Telegram message follows the same reconstruction process.

```text
Telegram Update

↓

Cloudflare Worker

↓

Locate Store Durable Object

↓

Load Conversation State

↓

Load Pending Execution State

↓

Load Owner Preferences

↓

Assemble Execution Context

↓

Global Orchestrator

↓

Execute One Control Loop

↓

Persist Updated State

↓

Return Response
```

No execution depends upon previously existing runtime memory.

Every request reconstructs its execution context from persisted state.

---



## Context Assembly

Before the Global Orchestrator begins reasoning, the Conversation Manager assembles the execution context.

The assembled context contains:

- current Telegram message,
- relevant conversation state,
- pending execution state,
- active clarification (if any),
- owner preferences,
- verified business facts required by the current execution.

Only context relevant to the current business objective is supplied.

Entire conversation histories are never forwarded blindly to the language model.

---



## Preference Management

Owner preferences are treated as persistent configuration rather than conversational information.

Whenever the Global Orchestrator determines that the owner wishes to establish or modify a standing preference, the Conversation Manager persists the updated preference.

Future orchestration cycles automatically receive those preferences during context reconstruction.

Business Capabilities never read or modify preference storage directly.

---



## Clarification Recovery

Clarification is treated as suspended execution rather than conversational history.

When clarification is requested, the Conversation Manager persists:

- originating execution,
- originating business objective,
- requesting Business Capability,
- required information,
- current execution checkpoint.

When the owner replies, the Conversation Manager reconstructs the suspended execution and resumes orchestration from the appropriate point rather than beginning a completely new reasoning process.

---



## State Persistence Rules

The following architectural rules always apply.

- Runtime memory is never considered authoritative.
- SQLite persistence is always the source of truth.
- Every execution cycle begins with state reconstruction.
- Every execution cycle ends with state persistence.
- Business state is never stored inside conversational state.
- Owner preferences remain independent of conversations.
- A new conversation clears only conversational state.
- Business state and owner preferences remain unaffected.

---



## Failure Handling

The Conversation Manager must safely recover from:

- Worker restart,
- Durable Object activation,
- Durable Object eviction,
- interrupted conversations,
- interrupted clarification workflows,
- incomplete execution checkpoints.

Whenever recovery is possible, execution resumes from the most recently persisted state.

If recovery is impossible, only conversational state is reinitialized.

Business state and owner preferences remain preserved.

---



## Observability

The Conversation Manager records:

- state reconstruction,
- context assembly,
- clarification suspension,
- clarification recovery,
- preference updates,
- state persistence,
- execution checkpoint restoration.

These events become part of the execution trace and allow engineers to understand how conversational state influenced orchestration behaviour.

---



## Cloudflare Runtime Architecture

Each store is represented by exactly one Cloudflare Durable Object.

The Durable Object is the execution environment for one orchestration cycle.

Persistent SQLite storage attached to the Durable Object stores:

- conversation state,
- pending execution state,
- owner preferences.

When a request arrives:

- the Durable Object reconstructs state from SQLite,
- executes exactly one orchestration cycle,
- persists any updated state,
- returns the response.

The Durable Object may then be suspended or destroyed without affecting correctness because all required state has already been persisted.

The architecture therefore treats Durable Objects as stateless execution environments operating over durable persisted state rather than as long-running in-memory applications.

---



## Production End-to-End Validation

The Conversation Manager is accepted only after demonstrating correct behaviour within the deployed Cloudflare environment.

Validation scenarios include:

- multi-turn bill construction,
- clarification followed by successful execution,
- owner preference persistence across independent conversations,
- Durable Object activation with successful state reconstruction,
- Worker restart with successful conversation recovery,
- suspended execution resuming correctly after later Telegram messages,
- `/new chat` clearing conversational state while preserving business state and owner preferences.

The implementation is considered complete only when every orchestration cycle can be reconstructed deterministically regardless of Durable Object lifetime.

---



## Architectural Principles

The Conversation Manager guarantees state reconstructability rather than runtime persistence.

The Durable Object provides deterministic execution.

SQLite provides durable state.

The Global Orchestrator provides reasoning.

Business Capabilities provide business correctness.

Together they ensure that every Telegram message is processed as an independent execution while preserving the illusion of one continuous conversation.

# Chapter 13 — Runtime Architecture



## Purpose

The Runtime Architecture describes how the software architecture executes within the Cloudflare platform.

The previous chapters defined the responsibilities of the software components.

This chapter explains how those responsibilities are mapped onto Cloudflare's execution model.

The objective is not simply to deploy the application on Cloudflare.

The objective is to design the application so that it naturally follows Cloudflare's execution philosophy.

Every runtime decision is therefore justified by the execution characteristics of the Cloudflare platform rather than by implementation convenience.

---



# Architectural Philosophy

Traditional cloud applications generally assume that servers remain alive for long periods of time.

State is frequently cached inside application memory, while requests are routed between long-running application instances.

Cloudflare approaches distributed computing differently.

Cloudflare assumes that compute is temporary.

Execution environments may be created, suspended or destroyed at any time.

Persistent state therefore cannot depend upon process lifetime.

Instead, computation should be lightweight, deterministic and reconstructable from durable state whenever execution begins.

Our architecture intentionally follows this philosophy.

Business correctness never depends upon runtime memory.

Every orchestration cycle begins by reconstructing the required execution state and ends by persisting the updated state before execution completes.

The lifetime of a process therefore becomes irrelevant.

---



# Runtime Components

The runtime consists of five primary components.

```text
Telegram

↓

Cloudflare Worker

↓

Store Durable Object

↓

Business Runtime

↓

Gemini API
```

Each component owns one independent responsibility.

---



## Telegram

Telegram is the external communication channel.

Its responsibilities are intentionally minimal.

It delivers user messages to the application and returns responses produced by the runtime.

Telegram owns no business logic, conversational state or orchestration behaviour.

It is simply the transport layer.

---



## Cloudflare Worker



### Why Workers Exist

Cloudflare Workers exist to execute short-lived, stateless computation close to the incoming request.

Rather than maintaining permanently running application servers, Cloudflare creates lightweight execution environments capable of handling requests with extremely low startup latency.

Workers are therefore designed for request processing rather than long-lived application state.

---



### Responsibility in this Architecture

Within this application the Worker acts as the runtime entry point.

Its responsibilities include:

- receiving Telegram webhooks,
- validating incoming requests,
- extracting the Store Identifier,
- locating the correct Durable Object,
- forwarding the request,
- returning the final response to Telegram.

The Worker performs no business reasoning.

It performs no orchestration.

It owns no persistent business state.

Its responsibility is limited to request routing.

---



## Store Durable Object



### Why Durable Objects Exist

Workers intentionally remain stateless.

Many real applications, however, require one logical entity to own mutable state.

Examples include:

- a shopping cart,
- a multiplayer game room,
- a collaborative document,
- or, in our case, a single kirana store.

Cloudflare introduced Durable Objects to solve exactly this problem.

A Durable Object represents one logical entity with exclusive ownership of its state.

Instead of many servers competing to modify the same database records, requests for that logical entity are routed to its owning Durable Object.

This greatly simplifies correctness, consistency and concurrency.

---



### Responsibility in this Architecture

One Durable Object represents one store.

It owns:

- conversation reconstruction,
- orchestration execution,
- Business Capability execution,
- SQLite-backed persistent state,
- execution checkpoints,
- observability events.

No two Durable Objects ever share ownership of the same store.

This establishes a single deterministic execution environment for every business operation belonging to that store.

---



## Capability Registry



### Why It Exists

The Global Orchestrator reasons in terms of business objectives.

It should not contain hardcoded knowledge of individual Business Capabilities.

The Capability Registry provides this abstraction.

It maintains the mapping between business domains and their owning Business Capabilities.

Examples include:

- Inventory
- Billing
- Khata
- Analytics

The Global Orchestrator consults the registry after identifying the business objective.

The registry returns the appropriate Business Capability without exposing implementation details.

Adding a future capability therefore requires registering it rather than modifying orchestration logic.

---



## Business Runtime

The Business Runtime executes the software architecture described throughout this document.

Its responsibilities include:

- reconstructing execution context,
- running the Global Orchestrator,
- invoking Business Capabilities,
- enforcing verification gates,
- persisting updated state,
- producing structured execution results.

The runtime performs exactly one orchestration cycle for every incoming Telegram request.

Execution then terminates.

A subsequent request reconstructs state and begins a new orchestration cycle.

---



## Gemini API

Gemini provides adaptive reasoning.

It is responsible for:

- understanding business intent,
- planning business objectives,
- coordinating Business Capabilities,
- requesting clarification,
- generating grounded conversational responses.

Gemini never modifies business state directly.

Every business modification occurs exclusively through deterministic Business Capabilities.

This preserves the separation between reasoning and business correctness established throughout the architecture.

---



# Runtime Request Flow

Every incoming request follows the same execution lifecycle.

```text
Telegram Message

↓

Cloudflare Worker

↓

Resolve Store Durable Object

↓

Reconstruct State from SQLite

↓

Global Orchestrator

↓

Business Capability Execution

↓

Verification Gates

↓

Persist Updated State

↓

Generate Response

↓

Return Response to Telegram
```

Each request is therefore independent.

Continuity is achieved through persisted state rather than long-running processes.

---



# Runtime Design Principles

The runtime follows the following architectural principles.

- Workers remain stateless.
- Durable Objects own one logical store.
- SQLite is the authoritative source of persisted state.
- Every request reconstructs execution state.
- Every request persists updated state before completion.
- Business state changes occur only through Business Capabilities.
- Adaptive reasoning never directly modifies business state.
- Runtime lifetime never influences business correctness.

---



# Production Validation

The runtime architecture is considered complete only after demonstrating successful execution within the deployed Cloudflare environment.

Validation must demonstrate:

- Telegram webhooks reaching the Worker.
- Correct routing to the owning Durable Object.
- Successful state reconstruction from SQLite.
- Correct orchestration execution.
- Successful Business Capability execution.
- Verification gate enforcement.
- State persistence after execution.
- Correct response delivery back to Telegram.

The runtime is accepted only when every orchestration cycle behaves identically regardless of whether the Durable Object was already active or newly activated for that request.

---



# Architectural Summary

Cloudflare Workers provide stateless request processing.

Cloudflare Durable Objects provide deterministic ownership of one store.

SQLite provides durable state.

The Global Orchestrator provides adaptive reasoning.

Business Capabilities provide deterministic business correctness.

Together these components create a runtime that is resilient to process lifetime, naturally scalable across independent stores and fully aligned with Cloudflare's execution philosophy.

# Chapter 14 — Persistence & Deployment Architecture



## Purpose

The Persistence & Deployment Architecture describes how business state is owned, persisted and executed within the Cloudflare platform.

Its objective is not simply to explain where data is stored.

Its objective is to explain why the application remains correct, consistent and resilient despite executing on a highly distributed serverless platform.

The architecture intentionally adopts Cloudflare's execution philosophy rather than reproducing a traditional server-and-database architecture on Cloudflare infrastructure.

---



# Architectural Philosophy

Traditional cloud applications usually separate compute and persistence into independent systems.

A typical architecture consists of:

- application servers,
- a remote relational database,
- a distributed cache,
- synchronization mechanisms,
- locking,
- connection pooling.

Each request typically travels across multiple network boundaries before completing.

As systems grow, engineers introduce additional infrastructure such as Redis, distributed locks and message queues to recover performance and consistency.

Cloudflare approaches the problem differently.

Instead of asking:

> "How do we synchronize many compute instances with one shared database?"

Cloudflare asks:

> "Can the compute that owns the data execute beside the data that it owns?"

This architectural shift removes many distributed systems problems instead of solving them with additional infrastructure.

Our application intentionally follows this philosophy.

---



# Persistence Philosophy

Every business domain has exactly one owner.

Likewise, every store has exactly one execution owner.

That owner is the Store Durable Object.

All business state belonging to that store is persisted within the SQLite database attached to the owning Durable Object.

The application therefore does not perform routine business operations over the network.

Business execution occurs beside its authoritative state.

---



# Store Ownership Model

Every store is mapped to exactly one Durable Object.

```text
Store

↓

Durable Object

↓

SQLite

↓

Business State
```

Every Telegram message belonging to that store is routed to the same Durable Object.

This guarantees that all business operations for one store execute within one logical ownership boundary.

The architecture therefore reasons about ownership rather than distributed coordination.

---



# Persistent State Model

SQLite is the authoritative source of truth.

The runtime persists several independent categories of state.

### Business State

Owned by the Business Capabilities.

Examples include:

- inventory,
- bills,
- customer credit,
- historical transactions.

Business state represents the operational knowledge of the store.

---



### Conversation State

Owned by the Conversation Manager.

Examples include:

- conversation metadata,
- clarification checkpoints,
- pending execution references.

Conversation state exists only to reconstruct future execution.

---



### Owner State

Represents long-lived owner preferences.

Examples include:

- preferred payment method,
- preferred product variants,
- shop information,
- GSTIN.

Owner state survives every conversation.

---



### Runtime State

Represents execution metadata.

Examples include:

- processed Telegram update identifiers,
- execution checkpoints,
- observability references,
- artifact references.

Runtime state exists to guarantee correctness rather than business functionality.

---



# Why SQLite Fits This Architecture

Within this architecture, SQLite is not simply a lightweight relational database.

It is the persistent storage engine attached directly to the execution environment responsible for the store.

Because business execution and persistence occur within the same Durable Object, routine business operations do not require communication with an external database service.

This significantly simplifies the application architecture.

The runtime does not need to manage:

- database connection pools,
- network retries for ordinary state access,
- distributed transactions between application servers and persistence,
- external cache invalidation.

Instead, execution reconstructs state directly from the store's persistent SQLite database, performs deterministic business operations and persists the updated state before completing.

The architecture therefore relies on locality of ownership rather than distributed coordination.

---



# Caching Philosophy

Caching is treated as an implementation optimization rather than a separate architectural subsystem.

The architecture never depends upon cache correctness.

SQLite remains the only authoritative source of persisted state.

If the Durable Object happens to remain active between requests, recently accessed information may naturally remain available in the runtime's memory.

This improves performance without changing correctness.

Should the Durable Object be suspended or recreated, execution simply reconstructs the required state from SQLite.

No additional cache reconstruction logic is required.

The application therefore remains architecturally correct regardless of runtime lifetime.

---



# Deployment Architecture

The deployed application consists of one global Cloudflare Worker together with a dynamically created collection of Store Durable Objects.

```text
Telegram

↓

Cloudflare Worker

↓

Resolve Store Identifier

↓

Store Durable Object

↓

SQLite

↓

Gemini

↓

Telegram Response
```

The Worker owns ingress.

The Durable Object owns execution.

SQLite owns persistence.

Gemini owns reasoning.

Each layer has exactly one clearly defined responsibility.

---



# Scalability Model

Scalability is achieved by increasing the number of independent Store Durable Objects rather than increasing the size of a centralized application server.

Every additional business kirana store receives its own execution environment and its own persistent state.

Kirana Stores therefore remain isolated from one another.

Business activity within one store does not introduce coordination complexity for unrelated stores.

The architecture naturally scales by replicating ownership boundaries rather than sharing mutable state.

---



# Correctness Model

The architecture preserves correctness through ownership.

Business state changes occur only:

- inside the owning Durable Object,
- through the owning Business Capability,
- using deterministic business operations,
- followed immediately by verification,
- before persistence completes.

Because ownership is never shared, correctness depends upon deterministic execution rather than distributed synchronization.

---



# Production Validation

The persistence and deployment architecture is considered complete only after demonstrating:

- successful Worker deployment,
- successful Durable Object creation,
- successful routing to the correct store,
- durable persistence across requests,
- successful state reconstruction after Durable Object activation,
- persistence across Worker restarts,
- independent isolation between multiple stores,
- successful observability of runtime state,
- correct attachment delivery for generated invoices and analysis presentations.

Validation is performed exclusively against the deployed Cloudflare environment.

The production deployment is treated as the authoritative runtime throughout development.

---



# Architectural Summary

Cloudflare simplifies distributed application design by colocating execution with the state that execution owns.

This architecture intentionally adopts that philosophy.

Instead of coordinating many application servers around one shared database, every store owns one execution environment and one persistent SQLite database.

Business correctness is therefore achieved through clear ownership boundaries, deterministic execution and durable persistence rather than through additional distributed infrastructure.

The result is an architecture that remains simpler, easier to reason about and naturally aligned with Cloudflare's execution model while fully satisfying the consistency requirements of the assessment.

# Chapter 15 — Engineering Methodology



## Purpose

The purpose of this methodology is to provide a deterministic engineering process for implementing the architecture defined throughout this document.

The objective is not to maximise the autonomy of the coding agent.

The objective is to maximise the correctness, traceability and repeatability of the engineering process.

The human engineer remains responsible for architecture, engineering judgement and acceptance.

The coding agent is responsible for implementation within clearly defined engineering constraints.

The implementation process therefore becomes a collaboration between human engineering judgement and automated software construction.

---



# Engineering Philosophy

This project follows the principle that architecture is designed by humans while implementation is delegated to an AI coding agent operating inside a controlled engineering loop.

The coding agent is never treated as an autonomous software architect.

Instead, it is treated as a highly capable implementation engineer operating within explicit architectural boundaries.

The architecture, invariants, acceptance criteria and verification strategy always remain the source of truth.

Every implementation decision must be traceable back to those documents.

---



# The Engineering Loop

Every implementation follows the same engineering loop.

```text
Architecture

↓

Goal Document

↓

Acceptance Criteria

↓

Test Design

↓

AI Implementation

↓

Self Verification

↓

Cloudflare Deployment

↓

Production Validation

↓

Human Review

↓

Accepted
or
Feedback

↓

Repeat
```

The loop terminates only when the implementation satisfies every architectural requirement and production validation succeeds.

---



# Goal Documents

Every implementation begins with a Goal Document.

The Goal Document becomes the single source of truth for one implementation task.

It describes:

- the architectural objective,
- responsibilities,
- constraints,
- acceptance criteria,
- verification requirements,
- production validation requirements.

The coding agent does not derive goals independently.

It implements the Goal Document.

If implementation drifts away from the goal, the Goal Document remains the authoritative reference for the next iteration.

---



# Test-First Engineering

Implementation begins by defining how success will be measured.

Tests are therefore designed before implementation.

Tests validate:

- architectural invariants,
- business correctness,
- component behaviour,
- failure handling,
- production behaviour.

The coding agent receives an objective that can be verified rather than merely described.

Verification therefore becomes deterministic.

---



# Production-First Testing

This project separates **fast unit tests** from **production integration tests**. Mocks must not be the sole authority for external API behavior.

## Unit tests — pure logic only

Unit tests cover deterministic transformation logic with **real-shaped Telegram payloads** (fixtures captured from or matching the Telegram Update schema). No network calls, no mocked `fetch`, no mocked Durable Object namespaces.

Examples:

- update parsing and command entity extraction,
- store identity resolution (`storeId = String(userId)`),
- `ApplicationRequest` normalization,
- stub DO handler responses,
- structured transport log shape (console only).

Fixtures live beside the module (`fixtures/telegram-updates.ts`). Tests are colocated (`*.test.ts`).

## Integration tests — real Worker when secrets are available

Integration tests POST to the **deployed Worker webhook URL** using secrets from `.dev.vars` (loaded via `vitest.setup.ts`). Required variables:

- `WORKER_WEBHOOK_URL` — full URL including `/webhook`
- `WEBHOOK_SECRET` — matches Wrangler secret and Telegram `setWebhook`

When secrets are absent (e.g. CI without credentials), integration tests **skip gracefully** with a clear message. The human operator runs the full suite locally after deploy.

Integration tests verify HTTP boundary behavior (403 wrong secret, 400 malformed JSON, 200 supported/unsupported handoff). They do not mock `STORE_DO`, `sendMessage`, or `fetch` to Telegram.

Outbound Telegram delivery (`sendMessage`, `sendDocument`), DO RPC, and attachment multipart upload are validated through:

- production deployment,
- production integration tests against live worker,
- manual production validation checklist (`running.md`).

## Human in the loop

Production validation is mandatory before component acceptance. The engineer deploys, registers the webhook, exercises the live bot, and reviews Cloudflare transport logs. Automated integration tests accelerate the loop but do not replace live Telegram verification.

## Rule

**Mocks must not be the sole authority for external API behavior.** If a test only asserts that a mock was called, it belongs in production integration or the manual checklist—not as a substitute for real Worker + Telegram behavior.

---



# Self-Verification Loop

The coding agent operates inside a bounded verification loop.

Each iteration follows the same sequence.

```text
Read Goal

↓

Implement

↓

Run Verification

↓

Collect Diagnostics

↓

Compare Against Goal

↓

Revise Implementation

↓

Repeat
```

The implementation is not considered successful because code was generated.

It is successful only when independent verification demonstrates that the architectural objective has been achieved.

The agent therefore iterates against evidence rather than confidence.

---



# Verification Philosophy

The implementation agent is never the sole authority responsible for judging correctness.

Every iteration must be validated using independent evidence.

Examples include:

- automated tests,
- type checking,
- linting,
- architectural acceptance tests,
- production validation,
- human engineering review.

The coding agent proposes.

Independent verification decides.

Whenever verification fails, the failure diagnostics become structured feedback for the next engineering iteration rather than manual debugging notes.

---



# Human Responsibilities

The human engineer remains responsible for:

- architecture,
- software decomposition,
- engineering judgement,
- defining business rules,
- defining acceptance criteria,
- reviewing implementation,
- accepting production behaviour.

The human does not manually implement every detail.

Instead, the human continuously improves the engineering loop itself.

---



# AI Responsibilities

The coding agent is responsible for:

- implementing the Goal Document,
- preserving architectural boundaries,
- running verification,
- interpreting verification failures,
- correcting implementation,
- repeating the verification loop until the defined stopping conditions are reached.

The coding agent never changes architectural intent without explicit human approval.

---



# Production-First Development

Every component is developed for the production environment from its first implementation.

Local execution exists only to accelerate iteration.

Production behaviour defines correctness.

Every completed component is therefore:

- deployed to Cloudflare,
- executed through the deployed Telegram bot,
- validated end-to-end,
- accepted only after successful production execution.

Production deployment is not the final milestone.

It is part of every engineering iteration.

---



# Incremental Development

The system is implemented one architectural component at a time.

Each component follows the complete engineering loop independently.

No subsequent component begins implementation until the current component has satisfied:

- implementation,
- verification,
- production deployment,
- end-to-end validation,
- human acceptance.

This prevents architectural debt from accumulating across the system.

---



# Context Management

Long-running coding conversations naturally accumulate irrelevant context.

When implementation begins to drift, the current engineering loop is terminated.

A new implementation loop begins from the Goal Document rather than attempting to recover an increasingly noisy conversation.

The architecture therefore remains the persistent source of truth instead of conversational memory.

---



# Stopping Rules

The engineering loop terminates only when all of the following conditions are satisfied.

- Architectural responsibilities implemented.
- Acceptance criteria satisfied.
- Verification succeeds.
- Production deployment succeeds.
- End-to-end validation succeeds.
- Human engineering review approves the implementation.

If any condition fails, the implementation re-enters the engineering loop.

---



# Engineering Principles

The implementation process follows the following principles.

- Architecture before implementation.
- Goals before prompts.
- Tests before code.
- Verification before confidence.
- Production before local optimisation.
- Small engineering loops over large autonomous tasks.
- Independent evidence over model self-assessment.
- Human engineering judgement over autonomous architectural decisions.

---



# Architectural Summary

This methodology treats AI-assisted software development as an engineering control system rather than an automated coding process.

The architecture defines what must be built.

The Goal Document defines the current objective.

Verification determines correctness.

Production deployment validates reality.

The coding agent repeatedly improves its implementation within these constraints until the implementation satisfies the architectural contract.

By placing architecture, verification and production validation around the coding agent, the engineering loop becomes deterministic, auditable and repeatable while preserving the productivity advantages of modern AI-assisted software development.

# Appendix B — Production Readiness & Assessment Traceability



## Purpose

This appendix does not introduce new architectural concepts.

Its purpose is to explicitly connect the assessment requirements to the architectural decisions established throughout this document, ensuring that every production concern evaluated by the assessment can be directly traced to an architectural responsibility.

Where a concern has already been addressed, this appendix clarifies the architectural intent.

Where additional clarification is valuable, this appendix extends the architecture without changing its design.

---



# B.1 Grounding & Verified Business Facts



## Architectural Location

- Global Orchestrator
- Business Capability Architecture
- Verification Gates
- Faithfulness Verification



## Clarification

Grounding is achieved by ensuring that every business fact originates from deterministic business execution rather than language model reasoning.

The Global Orchestrator never reasons over assumed business information.

Instead, every Business Capability returns **Verified Business Facts** after successful verification.

Examples include:

- verified inventory quantities,
- verified billing totals,
- verified GST calculations,
- verified customer balances,
- verified analytical results.

These verified facts become the only information consumed by subsequent orchestration cycles and by response generation.

The final conversational response is therefore grounded exclusively in verified business facts rather than model memory.

---



# B.2 Oversell Protection & Atomic Inventory Commitment



## Architectural Location

- Inventory Capability
- Billing Capability
- Business Verification



## Clarification

Oversell protection is owned entirely by the Inventory Capability.

The Billing Capability never modifies inventory directly.

The billing lifecycle is intentionally divided into two independent phases.

```text
Draft Bill

↓

Modify Draft

↓

Inventory Verification

↓

Atomic Inventory Commitment

↓

Bill Finalization
```

Draft bills never decrement inventory.

Inventory is modified only during bill finalization.

The Inventory Capability verifies:

- product existence,
- available quantity,
- business constraints.

Only after successful verification does the Inventory Capability perform one atomic inventory commitment.

If any verification fails:

- inventory remains unchanged,
- bill finalization is rejected,
- structured diagnostics are returned to the Global Orchestrator.

This guarantees that inventory never becomes negative and that partially completed sales never corrupt business state.

---



# B.3 Concurrency



## Architectural Location

- Runtime Architecture
- Persistence & Deployment Architecture



## Clarification

The architecture intentionally uses Cloudflare Durable Objects to establish deterministic ownership boundaries.

Every store is represented by exactly one Durable Object.

Every Telegram request belonging to that store is routed to its owning Durable Object.

Consequently, all business mutations for a single store execute within the same execution boundary.

Examples include:

- two concurrent billing requests,
- stock-in while another bill is finalizing,
- simultaneous khata updates.

Because ownership is never shared between multiple execution environments, business mutations cannot interleave unpredictably.

The architecture therefore preserves consistency through ownership rather than distributed synchronization.

No distributed locking, external coordination service or application-level synchronization mechanism is required.

---



# B.4 Idempotency



## Architectural Location

- Runtime Architecture
- Conversation Manager
- Persistence Architecture



## Clarification

Telegram may deliver the same update multiple times.

The architecture therefore treats every incoming Telegram update as an independently identifiable execution request.

Each update is recorded within a persistent Execution Ledger.

```text
Telegram Update

↓

Telegram Update ID

↓

Execution Ledger

↓

Already Processed?

↓

Yes
Return Previous Result

No
Execute Business Operation
```

The Execution Ledger records:

- Telegram Update ID,
- execution status,
- resulting business transaction,
- response metadata.

Before any business operation executes, the runtime verifies whether the update has already been processed.

Duplicate deliveries never re-execute deterministic business operations.

Instead, the previously recorded execution result is returned.

This guarantees that retries cannot:

- double-finalize a bill,
- double-decrement inventory,
- duplicate khata entries,
- duplicate business transactions.

---



# B.5 GST Ownership



## Architectural Location

- Billing Capability



## Clarification

Tax correctness is entirely owned by the Billing Capability.

The Billing Capability is responsible for:

- HSN code selection,
- GST slab determination,
- CGST calculation,
- SGST calculation,
- tax rounding,
- invoice tax breakdown,
- total verification.

GST calculations always originate from persisted product information.

The language model never calculates tax.

During bill finalization, the Billing Capability verifies:

- per-item GST,
- total GST,
- CGST/SGST split,
- invoice totals,
- rounding correctness.

Only verified tax calculations become part of the finalized bill.

When a PDF invoice is requested, the invoice is rendered directly from the verified finalized bill.

The PDF therefore becomes another representation of verified business facts rather than an independently generated document.

---



# B.6 Artifact Generation



## Architectural Clarification

Artifact generation is intentionally **not** modelled as an independent Business Capability.

Artifacts do not own business truth.

They simply present verified business facts in alternative representations.

The owning Business Capability therefore remains responsible for generating its own artifacts.

Examples include:

Billing Capability

- GST-compliant PDF invoice.

Analytics Capability

- PowerPoint sales analysis.

When an artifact is requested, the owning Business Capability:

- completes deterministic business execution,
- verifies business correctness,
- generates the requested artifact,
- stores the artifact,
- returns an artifact reference within its structured execution result.

The Global Orchestrator therefore receives:

- verified business facts,
- artifact metadata,
- execution diagnostics.

The final conversational response may then inform the owner that the requested document has been attached.

---



# B.7 Agent Harness Mapping



## Architectural Location

- Global Orchestrator
- Business Capability Architecture
- Runtime Architecture



## Clarification

The architecture has intentionally been designed independently of any specific agent framework.

It naturally maps onto modern agent harnesses.

The mapping is as follows.


| Architectural Component | Agent Harness Equivalent |
| ----------------------- | ------------------------ |
| Global Orchestrator     | Primary Agent            |
| Business Capability     | Sub-agent or Skill       |
| Deterministic Tool      | Tool / Function          |
| Conversation Manager    | External Memory          |
| Verification Gates      | Post-tool Validation     |
| Runtime Control Loop    | Agent Execution Loop     |


This separation ensures that the architecture remains portable across Cloudflare Agents, Claude Agent SDK, Deep Agents, Vercel AI SDK or equivalent frameworks without changing its fundamental design.

---



# B.8 Production Readiness Summary

The architecture explicitly satisfies the following production requirements.


| Production Concern         | Architectural Solution              |
| -------------------------- | ----------------------------------- |
| Natural-language reasoning | Global Orchestrator                 |
| Tool orchestration         | Business Capability Architecture    |
| Business correctness       | Deterministic Business Capabilities |
| Grounding                  | Verified Business Facts             |
| Faithfulness               | Faithfulness Verification           |
| Multi-turn execution       | Conversation Manager                |
| Persistent memory          | State Reconstruction                |
| Oversell protection        | Inventory Capability                |
| Atomic finalization        | Billing + Inventory                 |
| Concurrency                | Durable Object Ownership            |
| Idempotency                | Execution Ledger                    |
| GST correctness            | Billing Capability                  |
| PDF invoice                | Billing Capability                  |
| PPTX analysis              | Analytics Capability                |
| Production persistence     | Durable Objects + SQLite            |
| Cloud deployment           | Runtime & Deployment Architecture   |


---



# Final Engineering Principle

The architecture deliberately separates adaptive reasoning from deterministic business execution.

Language models are responsible for understanding intent, planning objectives and coordinating business capabilities.

Deterministic software remains responsible for business correctness, persistence, verification, concurrency, idempotency, tax calculation, inventory consistency and every permanent modification of business state.

By preserving this separation throughout the system, the architecture remains predictable, verifiable and production-ready while allowing the language model to contribute only where adaptive reasoning is genuinely required.