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
                // Leaflet, loaded via vendor/leaflet/leaflet.js in app.html
                L: "readonly",
                // Cross-file globals from classic <script> tags (see app.html load order)
                escapeHtml: "readonly",   // js/utils.js
                GPSTracker: "readonly",   // js/gps.js
                ChannelFX: "readonly",    // js/channel-fx.js
                App: "readonly",          // js/app.js, extended by js/app-*.js
                mixIntoApp: "readonly",   // js/app.js
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
