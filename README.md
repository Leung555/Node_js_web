# Papapick Node.js Web App

A small dependency-free Node.js web app for the Papapick landing page and booking form.

## Run locally

```bash
npm start
```

Open `http://localhost:3000`.

## Project structure

- `app.js` - Node.js HTTP server, static file hosting, and booking API.
- `public/index.html` - Papapick website.
- `data/bookings.json` - created automatically when bookings are submitted.

## Hostinger setup

Upload this project folder to Hostinger, then create a Node.js app with:

- Application startup file: `app.js`
- Start command: `npm start`
- Node.js version: `18` or newer

The app uses Hostinger's `PORT` environment variable automatically. Booking submissions are saved to `data/bookings.json` on the server.
