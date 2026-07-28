import { defineConfig } from "vite";

// Relative asset paths: this page is deployed as a GitHub Pages *project*
// site (https://<owner>.github.io/velkren/, not the domain root), where
// Vite's default root-absolute paths would 404. Relative paths work under
// any subpath, a future custom domain, and local `vite preview` alike.
export default defineConfig({
  base: "./",
});
