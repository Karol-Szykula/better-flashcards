/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      comment:
        "A cycle between two modules means neither can be read on its own; split the shared contract into src/entities instead",
      from: {},
      to: { circular: true },
    },
    {
      name: "no-gui-from-domain",
      severity: "error",
      comment:
        "Domain code must not know how it is drawn; the vault, Anki and lifecycle services stay usable from tests and from the sync commands",
      from: { path: "^src/(entities|services)/" },
      to: { path: "^src/gui/" },
    },
    {
      name: "no-react-from-services",
      severity: "error",
      comment:
        "Services describe what happens; components describe how it looks",
      from: { path: "^src/services/" },
      to: { path: "^react$" },
    },
    {
      name: "no-react-dom-from-services",
      severity: "error",
      comment:
        "Services describe what happens; components describe how it looks",
      from: { path: "^src/services/" },
      to: { path: "^react-dom$" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: { path: "^(coverage|dist|node_modules|main\\.js)" },
    includeOnly: "^src/",
    tsConfig: { fileName: "tsconfig.json" },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "default", "types"],
    },
  },
};
