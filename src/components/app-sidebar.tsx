import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutGrid,
  Boxes,
  Scissors,
  Package,
  Layers,
  Factory,
  ShieldCheck,
  FlaskConical,
  Settings,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useAuth } from "@/lib/auth";

const planner = [
  { title: "Planner", url: "/planner", icon: LayoutGrid },
];
const library = [
  { title: "Combinations", url: "/combinations", icon: Layers },
  { title: "Coils", url: "/coils", icon: Boxes },
  { title: "Slits", url: "/slits", icon: Scissors },
  { title: "Products", url: "/products", icon: Package },
];

export function AppSidebar() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { hasAtLeast } = useAuth();
  const isActive = (p: string) => (p === "/" ? pathname === "/" : pathname.startsWith(p));
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <div className="grid h-7 w-7 place-items-center rounded-md bg-primary text-primary-foreground">
            <Factory className="h-4 w-4" />
          </div>
          <div className="text-sm font-semibold tracking-tight group-data-[collapsible=icon]:hidden">
            Slitting Planner
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Plan</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {planner.map((i) => (
                <SidebarMenuItem key={i.url}>
                  <SidebarMenuButton asChild isActive={isActive(i.url)}>
                    <Link to={i.url} className="flex items-center gap-2">
                      <i.icon className="h-4 w-4" />
                      <span>{i.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Library</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {library.map((i) => (
                <SidebarMenuItem key={i.url}>
                  <SidebarMenuButton asChild isActive={isActive(i.url)}>
                    <Link to={i.url} className="flex items-center gap-2">
                      <i.icon className="h-4 w-4" />
                      <span>{i.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {hasAtLeast("manager") && (
          <SidebarGroup>
            <SidebarGroupLabel>Bulk Lab</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive("/bulk-lab")}>
                    <Link to="/bulk-lab" className="flex items-center gap-2">
                      <FlaskConical className="h-4 w-4" />
                      <span>Bulk combination lab</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
        {hasAtLeast("manager") && (
          <SidebarGroup>
            <SidebarGroupLabel>Admin</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive("/admin")}>
                    <Link to="/admin" className="flex items-center gap-2">
                      <Settings className="h-4 w-4" />
                      <span>Admin panel</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                {hasAtLeast("admin") && (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={isActive("/audit")}>
                      <Link to="/audit" className="flex items-center gap-2">
                        <ShieldCheck className="h-4 w-4" />
                        <span>Audit log</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
    </Sidebar>
  );
}
