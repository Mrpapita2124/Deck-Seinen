import { definePlugin, routerHook } from "@decky/api";
import { staticClasses } from "@decky/ui";
import { FaCloud } from "react-icons/fa";
import { QamPanel } from "./components/QamPanel";
import { AddMorePage } from "./pages/AddMorePage";
import { ServicesPage } from "./pages/ServicesPage";

export default definePlugin(() => {
  routerHook.addRoute("/deck-seinen/add-more", AddMorePage);
  routerHook.addRoute("/deck-seinen/services", ServicesPage);

  return {
    name: "DeckSeinen",
    titleView: <div className={staticClasses.Title}>DeckSeinen</div>,
    content: <QamPanel />,
    icon: <FaCloud />,
    onDismount() {
      routerHook.removeRoute("/deck-seinen/add-more");
      routerHook.removeRoute("/deck-seinen/services");
    },
  };
});
