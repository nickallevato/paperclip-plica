/**
 * Vendored Paperclip UI primitives.
 *
 * shadcn components are copy-into-project by design, so vendoring is the
 * intended usage rather than a workaround. `CompanyPatternIcon`, `StatusBadge`,
 * and `StatusGlyph` are ordinary host components copied for the same reason:
 * plugin bundles cannot import from the host's `@/components/*`.
 *
 * These render inside the host DOM, so the CSS custom properties they rely on
 * (`--status-task-*`, `--status-agent-*`, chip recipes) resolve against the
 * host's stylesheet exactly as they do for host-rendered chips. Vendoring the
 * markup keeps the visual result identical without duplicating any CSS.
 */
export { Button, buttonVariants } from "./button";
export { Badge, badgeVariants } from "./badge";
export {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./card";
export {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from "./popover";
export { Textarea } from "./textarea";
export {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "./dropdown-menu";
export { CompanyPatternIcon, companyAccentColor } from "./CompanyPatternIcon";
export { IssueStatusBadge } from "./StatusBadge";
export { StatusGlyph } from "./StatusGlyph";
