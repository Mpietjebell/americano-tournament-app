import { Link, Outlet } from "@remix-run/react";
import { NavMenu } from "@shopify/app-bridge-react";
import { AppProvider } from "@shopify/polaris";

export default function App() {
  return (
    <AppProvider i18n={{}}>
      <NavMenu>
        <Link to="/app" rel="home">Tournaments</Link>
        <Link to="/app/tournament/new">New Tournament</Link>
      </NavMenu>
      <Outlet />
    </AppProvider>
  );
}
