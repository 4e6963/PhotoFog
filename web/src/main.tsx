import { render } from "preact";
import { registerSW } from "virtual:pwa-register";
import { App, updateReady } from "./App.tsx";
import { initPush } from "./push.ts";
import "./styles.css";

render(<App />, document.getElementById("app")!);

const updateSW = registerSW({
  onNeedRefresh() {
    updateReady.value = () => void updateSW(true);
  },
  onRegisteredSW() {
    void initPush();
  },
  onRegisterError(e: unknown) {
    console.warn("service worker registration failed", e);
    void initPush();
  },
});
