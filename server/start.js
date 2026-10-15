// Entry point for `npm start`. Plain JavaScript, so that on an old Node it can still explain what's wrong
// (older versions can't run the .ts files the rest of the server is written in).
const major = Number(process.versions.node.split(".")[0])
if (major < 24) {
  console.error(
    `Lineage Finder needs Node.js 24 or newer, but this computer has ${process.version}.\n` +
      "Install the current LTS version from https://nodejs.org and try again.",
  )
  process.exit(1)
}

await import("./main.ts")
