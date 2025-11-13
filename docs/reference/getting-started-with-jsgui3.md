# Getting Started with jsgui3

This project is intentionally small so you can inspect every moving part. jsgui3 renders the initial UI on the server, streams HTML to the browser, and reuses the same control definitions on the client for interactivity.

## Step 0: Check prerequisites
- Ensure Node.js 18 or newer is installed (`node --version`).
- npm ships with Node.js; nothing else is required.

## Step 1: Install dependencies
Run once after cloning:
```bash
npm install
```
This installs the core jsgui3 packages (`jsgui3-server`, `jsgui3-client`) plus `lang-tools` and Browserify.
The project also references `jsgui3-html` for its built-in CSS, so make sure it remains in `package.json`.

### Minimum dependencies
- `jsgui3-client` – client runtime and control base class.
- `jsgui3-server` – server runtime that handles bundling and SSR.
- `lang-tools` – utility package commonly used alongside jsgui3.
- `jsgui3-html` – HTML element helpers and base stylesheet (indirectly used via the server configuration).

## Step 2: Start the server (build included)
```bash
npm start
```
- Launches `server.js` on port `52000` (see the code listing below).
- The startup routine runs Browserify, so `public/js/app-bundle.js` is generated or refreshed without any extra commands.
- Once the server prints “server started”, open `http://127.0.0.1:52000/` to view the demo UI.

The rest of this guide prints the exact JavaScript files included in the project and explains what every section does, so you can modify them confidently. The code listings appear exactly as they are in the repository.

## server.js (full listing)
```javascript
const jsgui = require('./client');
const Server = require('jsgui3-server').Server;
const {Demo_UI} = jsgui.controls;

if (require.main === module) {
    const server = new Server({
        Ctrl: Demo_UI,
        'src_path_client_js': require.resolve('./client.js')
    });
    console.log('waiting for server ready event');
    server.on('ready', () => {
        console.log('server ready');
        server.start(52000, function (err, cb_start) {
            if (err) {
                throw err;
            } else {
                console.log('server started');
            }
        });
    })
}
```

**How it works**
- The file imports the client bundle so the server can reach `Demo_UI`, then constructs `jsgui3-server.Server` with that control and the path to `client.js`.
- When executed directly (`node server.js` or `npm start`), the server waits for a `ready` event signifying that Browserify has produced the client bundle and extracted CSS.
- After the ready event, `server.start(52000, …)` binds an HTTP server on port 52000. The start callback throws on failure and logs on success, so you know when the app is available at `http://127.0.0.1:52000/`.

## client.js (full listing)
```javascript
const jsgui = require('jsgui3-client');
const {controls, Control, mixins} = jsgui;
const {dragable} = mixins;

const Active_HTML_Document = require('jsgui3-server/controls/Active_HTML_Document');

class Demo_UI extends Active_HTML_Document {
    constructor(spec = {}) {
        spec.__type_name = 'demo_ui';
        super(spec);
        const {context} = this;
        this.add_class('demo-ui');
        const compose = () => {
            const window = new controls.Window({
                context: context,
                title: 'jsgui3-html Window Control',
                pos: [10, 10]
            })
            this.add(window);
        }
        if (!spec.el) {
            compose();
        }
    }
}

Demo_UI.css = `

* {
    margin: 0;
    padding: 0;
}

body {
    overflow-x: hidden;
    overflow-y: hidden;
    background-color: #E0E0E0;
}

.demo-ui {
    
    /* 

    display: flex;
    flex-wrap: wrap;
    
    flex-direction: column; 
    justify-content: center;
    align-items: center;
    text-align: center;
    min-height: 100vh;
    */
    
}
`;

controls.Demo_UI = Demo_UI;
module.exports = jsgui;
```

**How it works**
- The file loads the jsgui3 client runtime, keeps the `dragable` mixin handy, and extends `Active_HTML_Document` so the control can bootstrap both on server and browser.
- `Demo_UI` sets its `__type_name`, registers a `.demo-ui` CSS class, and adds a single `controls.Window` when the control is first composed (the `spec.el` guard prevents duplicate work during hydration).
- The extensive comment blocks document design ideas; they are part of the source code and appear in the listing unchanged.
- `Demo_UI.css` attaches component styles that reset layout, lock the body background, and reserve space for future flex layout tweaks.
- Finally, `controls.Demo_UI = Demo_UI` registers the control so the server can instantiate it, and the module exports `jsgui` so `server.js` has access to the registry.

## Styling options
Inline CSS strings can live alongside controls, as shown in `Demo_UI.css`. The demo does not yet extract these strings automatically. To serve additional styles today, either add a static stylesheet under `public/` and expose it in `server.js`, or extend the existing CSS bundling pipeline.

With these listings and explanations, you have the complete picture of how the example renders, how the server bundles and serves assets, and how the client activates the shared controls.
