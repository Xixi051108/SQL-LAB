import { spawn } from "node:child_process";
const options = { stdio: "inherit", windowsHide: true };
const processes = [
  spawn(
    process.execPath,
    ["--env-file-if-exists=.env", "--watch", "server/index.js"],
    options,
  ),
  spawn(process.execPath, ["node_modules/vite/bin/vite.js"], options),
];
for (const child of processes)
  child.on("exit", () => {
    for (const other of processes) other.kill();
  });
process.on("SIGINT", () => {
  for (const child of processes) child.kill();
});
