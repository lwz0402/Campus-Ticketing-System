# Gewuqingchun Event Management System

An event operations system built for the Beijing Bayi School High School Musical program. It was designed specifically for this production, but it can also be adapted through configuration and light customization for other events, schools, or similar operational scenarios.

Created by Arthur LIU with assistance from Codex.

## Overview

This project combines ticketing, seat management, check-in, merchandise sales, voucher workflows, account administration, backups, and operational monitoring in a single Node.js application.

The system includes:

- An admin interface for project setup, seat configuration, pricing, ticket numbering, discount rules, data import/export, backups, and audit logs
- A sales interface for seat locking, ticket checkout, ticket issuance, merchandise checkout, coupon handling, and check-in
- Real-time synchronization through `Socket.IO`
- File-based persistence with backup and recovery support

## Main Features

- Multi-project seat map management
- Ticket number generation with random or sequence-based modes
- Seat locking and real-time ticket issuing
- Ticket discount rules and coupon workflows
- Single and batch check-in
- Merchandise catalog, checkout modes, order export, and presale vouchers
- Admin account management with role-based access
- Audit logs, metrics, state export, and backup restore
- Optional Redis support for locks, counters, and cross-instance coordination
- Optional HTTPS support through local certificate files

## Tech Stack

- Node.js
- Express
- Socket.IO
- QRCode
- bwip-js
- canvas
- bcryptjs
- Playwright for testing dependencies

## Project Structure

```text
.
├── main.js
├── package.json
├── API.md
├── data/
├── public/
│   ├── admin.html
│   ├── sales.html
│   ├── login.html
│   ├── status.html
│   ├── ops.html
│   ├── cli.html
│   ├── cli-wiki.html
│   ├── css/
│   └── js/
└── tests/
```

## Interfaces

- `/login.html` - login page
- `/admin.html` - administrator console
- `/sales.html` - sales and ticketing console
- `/status.html` - system status page
- `/ops.html` - operations page
- `/cli.html` - command-style interface
- `/cli-wiki.html` - CLI usage reference

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Start the server

```bash
npm start
```

By default, the app runs on port `3000`.

### 3. Open the system

Visit:

- `http://localhost:3000/login.html`
- `http://localhost:3000/admin.html`
- `http://localhost:3000/sales.html`

## Default Accounts

If no data exists yet, the system creates default accounts automatically:

- Admin: `admin` / `admin123`
- Sales: `sales` / `sales123`

Change these before any real deployment.

## Environment Variables

The application supports the following environment variables:

- `PORT` - server port, default `3000`
- `ADMIN_USERNAME` - default admin username
- `ADMIN_PASSWORD` - default admin password
- `SALES_USERNAME` - default sales username
- `SALES_PASSWORD` - default sales password
- `JSON_BODY_LIMIT` - JSON request size limit, default `12mb`
- `REDIS_URL` or `REDIS` - optional Redis connection string
- `SSL_KEY` - optional TLS private key path
- `SSL_CERT` - optional TLS certificate path

## Data Storage

Application data is stored locally in the `data/` directory.

Important locations:

- `data/state.json` - main persisted application state
- `data/backups/` - automatic and manual backups
- `data/locks/` - local file-lock fallback when Redis is not used
- `public/uploads/merch/` - uploaded merchandise images

## HTTPS Support

If certificate files are available, the server can start in HTTPS mode automatically.

Default certificate paths:

- `certs/key.pem`
- `certs/cert.pem`

You can also override them with `SSL_KEY` and `SSL_CERT`.

## Redis Support

Redis is optional, but recommended when you need:

- More reliable distributed locking
- Shared counters across multiple instances
- Better collision prevention for voucher and order number generation
- Better rate limiting behavior

Without Redis, the system falls back to local file locks and in-process counters.

## API Documentation

Detailed API documentation is available in [API.md](./API.md).

It includes:

- HTTP endpoints
- Socket.IO events
- Data structures
- Permission rules
- Request and response examples

## Notes for Deployment

- This project was originally tailored for the Beijing Bayi School High School Musical event
- It can still be repurposed for other events by adjusting seat data, ticketing rules, branding, and workflows
- Because the app uses `canvas`, some operating systems may require native build dependencies during installation
- The default setup uses local file persistence, so regular backups are strongly recommended

## Available Script

```bash
npm start
```

This runs:

```bash
node main.js
```

## License

This repository is released under the `MIT` License.

## Credits

Created by Arthur LIU with assistance from Codex.
