/** Mounts either the loopback editor or the isolated static tour for its dedicated build. */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const root = document.getElementById("root");
if (root === null) {
  throw new Error("Missing root element");
}

const application = import.meta.env.MODE === "demo"
  ? import("./demo/DemoApp.js").then(({ DemoApp }) => <DemoApp />)
  : import("./App.js").then(({ App }) => <App />);

void application.then((element) => {
  createRoot(root).render(<StrictMode>{element}</StrictMode>);
});
