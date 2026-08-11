# Upstream PolyTrack 0.6.2 provenance

The browser distribution was collected from Kodub's PolyTrack 0.6.2 itch.io HTML build at:

`https://html-classic.itch.zone/html/17754954/`

The two primary artifacts supplied by the project owner match the runtime version markers used throughout the application:

| File | SHA-256 |
| --- | --- |
| `main.bundle.js` | `8495e6a31cfb66b55861188bd8041b38479ee5b50bd412cc1f6c2b17229f6488` |
| `simulation_worker.bundle.js` | `1f6aa3480275ef7e1b324666a0781cf7327660f4dc22bede8c8353676097f909` |

The runtime contains explicit `0.6.2` protocol, update, UI, leaderboard, and simulation version markers. It also contains the 0.6.2 maintenance-update text.

PolyTrack is created by Kodub. The upstream production distribution is retained unmodified in `vendor/`; PolyViewer's build creates a generated patched copy. Do not describe this repository as the original PolyTrack source code.
