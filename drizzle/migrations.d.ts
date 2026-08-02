declare const migrations: {
  journal: { entries: unknown[] };
  migrations: Record<string, string>;
};

export default migrations;
