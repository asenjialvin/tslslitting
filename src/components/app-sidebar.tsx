import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  LayoutGrid,
  Boxes,
  Scissors,
  Package,
  Layers,
  Factory,
  ShieldCheck,
  FlaskConical,
  Settings,
  Sparkles,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/lib/auth";

const overview = [{ title: "Dashboard", url: "/dashboard", icon: LayoutDashboard }];
const planner = [{ title: "Combination Finder", url: "/planner", icon: LayoutGrid }];
const library = [
  { title: "Combinations", url: "/combinations", icon: Layers },
  { title: "Coil Specs", url: "/coils", icon: Boxes },
  { title: "Slit Specs", url: "/slits", icon: Scissors },
  { title: "Products", url: "/products", icon: Package },
];

function NavGroup({
  label,
  items,
  isActive,
  onNavigate,
}: {
  label: string;
  items: { title: string; url: string; icon: typeof LayoutGrid; badge?: string }[];
  isActive: (p: string) => boolean;
  onNavigate: () => void;
}) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((i) => (
            <SidebarMenuItem key={i.url}>
              <SidebarMenuButton asChild isActive={isActive(i.url)} tooltip={i.title}>
                <Link to={i.url} className="flex items-center gap-2.5" onClick={onNavigate}>
                  <i.icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{i.title}</span>
                </Link>
              </SidebarMenuButton>
              {i.badge && <SidebarMenuBadge>{i.badge}</SidebarMenuBadge>}
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function AppSidebar() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { hasAtLeast, role, user } = useAuth();
  const { isMobile, setOpenMobile } = useSidebar();
  const isActive = (p: string) => (p === "/" ? pathname === "/" : pathname.startsWith(p));

  // On mobile the sidebar renders as a slide-over sheet — collapse it as
  // soon as a destination is picked so tapping a link both navigates and
  // dismisses the menu, instead of leaving it open over the new page.
  const closeOnMobile = () => {
    if (isMobile) setOpenMobile(false);
  };

  // Username is just the local part of the signed-in email (before the @).
  const username = user?.email ? user.email.split("@")[0] : null;

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="border-b border-sidebar-border/60 px-3 py-3">
        <div className="flex items-center gap-2.5">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-secondary to-secondary/70 text-secondary-foreground shadow-sm">
            <Factory className="h-4 w-4" />
          </div>
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <div className="truncate text-sm font-semibold leading-tight tracking-tight text-sidebar-foreground">
              Slitting Planner
            </div>
            <div className="truncate text-[11px] leading-tight text-sidebar-foreground/55">
              Tononoka Steels
            </div>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent className="gap-0.5">
        <NavGroup label="Overview" items={overview} isActive={isActive} onNavigate={closeOnMobile} />
        <NavGroup label="Tools" items={planner} isActive={isActive} onNavigate={closeOnMobile} />
        <NavGroup label="Library" items={library} isActive={isActive} onNavigate={closeOnMobile} />
        {hasAtLeast("manager") && (
          <>
            <SidebarSeparator className="my-1" />
            <NavGroup
              label="Combination Generator"
              items={[{ title: "Generator", url: "/bulk-lab", icon: FlaskConical }]}
              isActive={isActive}
              onNavigate={closeOnMobile}
            />
          </>
        )}
        {hasAtLeast("admin") && (
          <>
            {!hasAtLeast("manager") && <SidebarSeparator className="my-1" />}
            <SidebarGroup>
              <SidebarGroupLabel>Admin</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={isActive("/admin")} tooltip="Admin panel">
                      <Link to="/admin" className="flex items-center gap-2.5" onClick={closeOnMobile}>
                        <Settings className="h-4 w-4 shrink-0" />
                        <span className="truncate">Admin panel</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={isActive("/audit")} tooltip="Audit log">
                      <Link to="/audit" className="flex items-center gap-2.5" onClick={closeOnMobile}>
                        <ShieldCheck className="h-4 w-4 shrink-0" />
                        <span className="truncate">Audit log</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border/60 px-3 py-2.5 group-data-[collapsible=icon]:hidden">
        <div className="flex items-center gap-2 rounded-md bg-sidebar-accent/50 px-2.5 py-2 text-[11px] text-sidebar-foreground/70">
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-secondary" />
          <div className="min-w-0 leading-tight">
            <div className="truncate">
              {username ? (
                <>
                  Signed in as <span className="font-medium font-mono text-sidebar-foreground">{username}</span>
                </>
              ) : (
                "Signed in"
              )}
            </div>
            {role && (
              <div className="truncate text-[10px] capitalize text-sidebar-foreground/50">{role}</div>
            )}
          </div>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
