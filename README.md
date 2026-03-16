# HLS Proxy

A simple Node.js proxy server for HLS (HTTP Live Streaming) content.

## Deployment

This project is configured for deployment on Render using the following files:

- `render.yaml` - Render deployment configuration
- `Procfile` - Process type definition for Render
- `package.json` - Dependencies and project metadata

## Local Development

```bash
npm install
node test.js
```

The server will run on port 3000 by default, or you can set a custom port using the `PORT` environment variable.

## Usage

The proxy accepts requests to `/hls?src=<url>` where `<url>` is the URL of the HLS content to proxy.

Example:
```
http://localhost:3000/hls?src=https://example.com/stream.m3u8
```

## Features

- Proxies HLS playlists (.m3u8 files)
- Rewrites playlist URLs to go through the proxy
- Handles media segments (.ts, .m4s, .mp4, etc.)
- CORS enabled
- Timeout protection (15 seconds)