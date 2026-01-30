import globals from "globals";

export default [
    {
        files: ["web/js/**/*.js"],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "script",
            globals: {
                ...globals.browser,
                AudioContext: "readonly",
                webkitAudioContext: "readonly",
            },
        },
        rules: {
            "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
            "no-undef": "error",
            "no-console": "off",
            "no-debugger": "warn",
            "eqeqeq": ["warn", "always"],
            "no-var": "warn",
        },
    },
];
