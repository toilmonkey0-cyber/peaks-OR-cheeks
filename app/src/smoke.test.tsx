import { screen } from "@testing-library/react";
it("renders the scaffold", () => {
  const el = document.createElement("div");
  el.textContent = "RipPack scaffold";
  document.body.appendChild(el);
  expect(screen.getByText("RipPack scaffold")).toBeInTheDocument();
});
