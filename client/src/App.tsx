import { Switch, Route, Router, Link, useLocation } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import Resumes from "@/pages/resumes";
import Recipients from "@/pages/recipients";
import Locations from "@/pages/locations";
import SettingsPage from "@/pages/settings";
import { PerplexityAttribution } from "@/components/PerplexityAttribution";
import {
  LayoutDashboard,
  FileText,
  Users,
  MapPin,
  Settings,
  Activity,
  Moon,
  Sun,
} from "lucide-react";
import { useState, useEffect } from "react";

const NAV_ITEMS = [
  { path: "/", label: "Dashboard", icon: LayoutDashboard },
  { path: "/resumes", label: "Resumes", icon: FileText },
  { path: "/recipients", label: "Recipients", icon: Users },
  { path: "/locations", label: "Locations", icon: MapPin },
  { path: "/settings", label: "Settings", icon: Settings },
];

function Sidebar() {
  const [location] = useLocation();
  const [dark, setDark] = useState(() =>
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  return (
    <aside className="w-56 shrink-0 h-screen bg-sidebar border-r border-sidebar-border flex flex-col" data-testid="sidebar">
      <div className="flex items-center gap-2 px-4 py-4 border-b border-sidebar-border">
        <Activity className="w-5 h-5 text-primary" />
        <span className="font-semibold text-sm tracking-tight text-sidebar-foreground">JobPulse</span>
      </div>
      <nav className="flex-1 py-2 px-2 space-y-0.5">
        {NAV_ITEMS.map((item) => {
          const active = location === item.path || (item.path !== "/" && location.startsWith(item.path));
          const Icon = item.icon;
          return (
            <Link key={item.path} href={item.path}>
              <div
                className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm cursor-pointer transition-colors ${
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                }`}
                data-testid={`nav-${item.label.toLowerCase()}`}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </div>
            </Link>
          );
        })}
      </nav>
      <div className="px-3 py-3 border-t border-sidebar-border">
        <button
          onClick={() => setDark(!dark)}
          className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-full rounded-md"
          data-testid="toggle-theme"
        >
          {dark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
          {dark ? "Light mode" : "Dark mode"}
        </button>
        <div className="mt-2">
          <PerplexityAttribution />
        </div>
      </div>
    </aside>
  );
}

function AppRouter() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/resumes" component={Resumes} />
      <Route path="/recipients" component={Recipients} />
      <Route path="/locations" component={Locations} />
      <Route path="/settings" component={SettingsPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router hook={useHashLocation}>
          <div className="flex h-screen overflow-hidden bg-background">
            <Sidebar />
            <main className="flex-1 overflow-y-auto">
              <AppRouter />
            </main>
          </div>
        </Router>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
