import path from "path";
import webpack from "webpack";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const isProd = process.env.NODE_ENV === "production";

export default {
    entry: {
        spbots: {
            import: "./src/spBots.ts",
            library: {
                name: "SPBots",
                type: "amd",
            },
        },
    },
    mode: isProd ? "production" : "development",
    target: "web",
    context: path.resolve(__dirname),
    output: {
        path: path.resolve(__dirname, "./dist"),
        filename: "[name].js",
    },
    optimization: {
        minimize: isProd,
        usedExports: false,
        splitChunks: false,
    },
    resolve: {
        extensions: [".ts", ".js"],
        modules: ["node_modules"],
    },
    externals: [{ "@chronodivide/game-api": "amd @chronodivide/game-api" }, { three: "THREE" }],
    devtool: isProd ? false : "source-map",
    devServer: {
        static: {
            directory: path.resolve(__dirname, "./dist"),
        },
        devMiddleware: {
            writeToDisk: true,
        },
        compress: true,
        port: 8080,
        hot: false,
        liveReload: true,
    },
    plugins: [
        new webpack.optimize.LimitChunkCountPlugin({
            maxChunks: 1,
        }),
        new webpack.DefinePlugin({
            "process.env.PACKAGE_VERSION": JSON.stringify(require("./package.json").version),
        }),
    ],
};
