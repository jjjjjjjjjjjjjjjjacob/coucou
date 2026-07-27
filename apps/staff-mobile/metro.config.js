const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");
const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "react" || moduleName.startsWith("react/")) {
    const reactModulePath =
      moduleName === "react"
        ? path.resolve(projectRoot, "node_modules/react")
        : path.resolve(
            projectRoot,
            "node_modules/react",
            moduleName.slice("react/".length),
          );
    return context.resolveRequest(context, reactModulePath, platform);
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
