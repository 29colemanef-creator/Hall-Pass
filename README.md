# HallPass

A lightweight hall pass manager built with Node.js, Express, and a plain HTML/CSS/JavaScript frontend. Create a pass, approve or deny pending passes, and delete records. Pass data is saved locally in `data/pass-data.json`; no database is required.

## Requirements

- Node.js 18 or newer
- npm

## Install and run

From the project directory:

```bash
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000) in your browser. The Express server serves the frontend from `public/` and provides the pass API. Set the `PORT` environment variable to use a different port.

## Data

The app creates `data/pass-data.json` with an empty list the first time it starts. Passes are persisted there as JSON, so restarting the server keeps existing records. Back up this file to preserve the data.

## Project structure

```text
server.js
public/
  index.html
  styles.css
  app.js
data/
  pass-data.json
package.json
README.md
.gitignore
```
