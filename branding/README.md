# Chatables Branding Guidelines & Vector Assets

This directory contains the abstract vector branding assets designed for the **Chatables** privacy-first anonymous chat platform.

## Design Philosophy: The "Synapse Link"
The logo represents two anonymous nodes (users) communicating across a secure, overlapping bridge.
- **Secure Open Loops**: Left and right rings represent secure, private boundaries. They are open-ended C-shapes that interlock but do not connect, representing bridge communication without shared profile databases.
- **Private Nodes**: Central nodes (dots) represent individuals. Node A (left) is colored in **Electric Blue (`#4F8CFF`)** and Node B (right) in **White (`#FFFFFF`)**.
- **Negative Space Bridge**: The interlocking overlap forms a vertical column representing the secure, real-time voice and text stream.

## Vector Files
- [logo_primary.svg](logo_primary.svg): Primary horizontal wordmark logo (Icon + "chatables" typography).
- [logo_icon.svg](logo_icon.svg): 1:1 Icon-only vector file (designed for extension icons).
- [logo_monochrome.svg](logo_monochrome.svg): Flat white vector silhouette.

---

### Primary Logo Source (`logo_primary.svg`)
```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 150" width="100%" height="100%" fill="none">
  <g transform="translate(90, 75) scale(0.35) translate(-256, -256)">
    <path d="M 269.28 296 A 80 80 0 1 1 269.28 216" stroke="#FFFFFF" stroke-width="24" stroke-linecap="round" />
    <path d="M 242.72 216 A 80 80 0 1 1 242.72 296" stroke="#4F8CFF" stroke-width="24" stroke-linecap="round" />
    <circle cx="200" cy="256" r="20" fill="#4F8CFF" />
    <circle cx="312" cy="256" r="20" fill="#FFFFFF" />
  </g>
  <text x="175" y="94" font-family="Outfit, Inter, system-ui, sans-serif" font-size="56" font-weight="700" letter-spacing="-1.5">
    <tspan fill="#FFFFFF">chat</tspan><tspan fill="#4F8CFF">ables</tspan>
  </text>
</svg>
```

### Icon-Only Logo Source (`logo_icon.svg`)
```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%" fill="none">
  <path d="M 269.28 296 A 80 80 0 1 1 269.28 216" stroke="#FFFFFF" stroke-width="24" stroke-linecap="round" />
  <path d="M 242.72 216 A 80 80 0 1 1 242.72 296" stroke="#4F8CFF" stroke-width="24" stroke-linecap="round" />
  <circle cx="200" cy="256" r="20" fill="#4F8CFF" />
  <circle cx="312" cy="256" r="20" fill="#FFFFFF" />
</svg>
```
