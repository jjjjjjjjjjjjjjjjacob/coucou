import { resolve } from "node:path";
import { Config } from "@remotion/cli/config";

Config.setPublicDir(resolve(process.cwd(), "../danza-organica/public"));
Config.setChromiumOpenGlRenderer("angle");
Config.setOverwriteOutput(true);
