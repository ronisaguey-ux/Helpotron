import React from "react";
import ControlCenterView from "./ControlCenterView.jsx";

export default function AdminPanels({ userId = "" }) {
  return <ControlCenterView userId={userId} />;
}
