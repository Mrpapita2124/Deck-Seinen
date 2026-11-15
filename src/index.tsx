import { definePlugin, routerHook } from "@decky/api";
import { staticClasses } from "@decky/ui";
import { FaCloud } from "react-icons/fa";
import { QamPanel } from "./components/QamPanel";
import { AddMorePage } from "./pages/AddMorePage";

export default definePlugin(() => {
  routerHook.addRoute("/deck-seinen/add-more", AddMorePage);

  return {
    name: "DeckSeinen",
    titleView: <div className={staticClasses.Title}>DeckSeinen</div>,
    content: <QamPanel />,
    icon: <FaCloud />,
    onDismount() {
      routerHook.removeRoute("/deck-seinen/add-more");
    },
  };
});
