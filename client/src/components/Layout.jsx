import React, { Suspense } from "react";
import { Outlet } from "react-router-dom";
import Navbar from "./Navbar";
import Toast from "./Toast";

const Scene3D = React.lazy(() => import("./Scene3D"));

export default function Layout() {
  return (
    <main className="app-shell">
      <div className="scene-layer" aria-hidden="true">
        <Suspense fallback={null}>
          <Scene3D />
        </Suspense>
      </div>
      <Navbar />
      <Outlet />
      <Toast />
    </main>
  );
}
