// Component gallery: every toolkit component the app will use, with made-up catalog-shaped
// content. Development only: the route exists only under `npm run dev` (see app.tsx).
import { useState, type ReactNode } from "react"
import { toast } from "sonner"
import { ChevronsUpDown, Database, FolderOpen, Search, Settings, TableProperties } from "lucide-react"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item"
import { Kbd } from "@/components/ui/kbd"
import { Label } from "@/components/ui/label"
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover"
import { Progress } from "@/components/ui/progress"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { ACCENTS, DEFAULT_ACCENT, showAccent, type AccentId } from "@/lib/accents"
import {
  sampleApis,
  sampleDerivedLogic,
  sampleFields,
  sampleSuggestions,
  sampleVersions,
  type Confidence,
} from "@/dev/sample-data"

export default function ComponentsPage() {
  return (
    <TooltipProvider>
      <div className="min-w-0 space-y-8">
        <header className="space-y-2">
          <h1 className="font-head text-3xl">Component check</h1>
          <p className="text-muted-foreground">
            Development only. Every component the app will use, with made-up content shaped like the catalog. Try
            light and dark, a narrow window, and the accent colours in the settings panel.
          </p>
        </header>
        <ButtonsAndBadges />
        <CardsAndLists />
        <FieldTable />
        <ApiDetail />
        <SearchSection />
        <Notices />
        <SettingsAndDialogs />
      </div>
    </TooltipProvider>
  )
}

function Section(props: { title: string; usedOn: string; children: ReactNode }) {
  return (
    <section className="space-y-4 border-2 border-border bg-card p-4 shadow-md sm:p-6" aria-label={props.title} data-gallery-section>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-head text-xl">{props.title}</h2>
        <span className="text-sm text-muted-foreground">For: {props.usedOn}</span>
      </div>
      {props.children}
    </section>
  )
}

/** One proposal for how each kind of lineage looks, to judge by eye. */
function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  switch (confidence) {
    case "stated":
      return <Badge>stated</Badge>
    case "probable":
      return <Badge variant="outline">probable</Badge>
    case "not supported":
      return <Badge variant="secondary">not supported</Badge>
    case "no lineage":
      return <Badge variant="ghost">no lineage</Badge>
  }
}

function ButtonsAndBadges() {
  return (
    <Section title="Buttons, badges, little things" usedOn="every page">
      <div className="flex flex-wrap gap-3">
        <Button>Re-index</Button>
        <Button variant="secondary">Compare versions</Button>
        <Button variant="outline">Show all fields</Button>
        <Button variant="ghost">Clear</Button>
        <Button variant="link">SXRWIDG</Button>
        <Button variant="destructive">Remove</Button>
        <Button disabled>Disabled</Button>
        <Button size="icon" variant="outline" aria-label="Settings">
          <Settings />
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <ConfidenceBadge confidence="stated" />
        <ConfidenceBadge confidence="probable" />
        <ConfidenceBadge confidence="not supported" />
        <ConfidenceBadge confidence="no lineage" />
        <Separator orientation="vertical" className="h-6" />
        <Badge variant="outline">beta</Badge>
        <Badge variant="destructive">deprecated</Badge>
        <Badge variant="secondary">sunset 1 Jan 2027</Badge>
        <Separator orientation="vertical" className="h-6" />
        <Badge variant="outline" className="font-names">GET</Badge>
        <Badge variant="outline" className="font-names">POST</Badge>
        <Badge variant="outline" className="font-names">PUT</Badge>
        <Badge variant="outline" className="font-names">DELETE</Badge>
      </div>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="#">APIs</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="#" className="font-names">widget-requests</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="font-names">2.1.0</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <span>
          Open search: <Kbd>Ctrl</Kbd> <Kbd>K</Kbd>
        </span>
        <Tooltip>
          <TooltipTrigger render={<Button variant="outline" size="sm" />}>Hover for a tooltip</TooltipTrigger>
          <TooltipContent>Inferred from the field name. Check before relying on it.</TooltipContent>
        </Tooltip>
      </div>
      <p className="text-sm">
        Names font sample: <span className="font-names">SXRWIDG_PIDM · GXVTHNG_END_DATE · O0 l1I · widget-requests 2.1.0</span>
      </p>
    </Section>
  )
}

function CardsAndLists() {
  return (
    <Section title="Cards and lists" usedOn="API list, tables list">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {sampleApis.map((api) => (
          <Card key={api.name}>
            <CardHeader>
              <CardTitle className="font-names break-all">{api.name}</CardTitle>
              <CardDescription>{api.family}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Badge variant="outline">{api.type}</Badge>
              <Badge variant="outline">{api.versions} versions</Badge>
              {api.coverage === "none published" ? (
                <Badge variant="ghost">no lineage</Badge>
              ) : (
                <Badge>{api.coverage} lineage</Badge>
              )}
            </CardContent>
            <CardFooter>
              <Button variant="outline" size="sm">
                Open
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
      <ItemGroup className="gap-2">
        {sampleApis.map((api) => (
          <Item key={api.name} variant="outline">
            <ItemContent>
              <ItemTitle className="font-names">{api.name}</ItemTitle>
              <ItemDescription>
                {api.family} · {api.versions} versions · lineage {api.coverage}
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              <Button variant="outline" size="sm">
                Open
              </Button>
            </ItemActions>
          </Item>
        ))}
      </ItemGroup>
      <div className="grid gap-4 sm:grid-cols-2">
        <Empty className="border-2 border-dashed border-border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Database />
            </EmptyMedia>
            <EmptyTitle>No lineage published</EmptyTitle>
            <EmptyDescription>
              Ellucian's catalog doesn't say which tables this API uses. That's a gap in the catalog, not in this app.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
        <div className="space-y-3" aria-label="Loading placeholder">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious href="#" />
          </PaginationItem>
          <PaginationItem>
            <PaginationLink href="#">1</PaginationLink>
          </PaginationItem>
          <PaginationItem>
            <PaginationLink href="#" isActive>
              2
            </PaginationLink>
          </PaginationItem>
          <PaginationItem>
            <PaginationEllipsis />
          </PaginationItem>
          <PaginationItem>
            <PaginationLink href="#">38</PaginationLink>
          </PaginationItem>
          <PaginationItem>
            <PaginationNext href="#" />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </Section>
  )
}

function FieldTable() {
  return (
    <Section title="Fields with lineage (50 rows)" usedOn="API detail, table page, column page">
      <ScrollArea className="h-96 border-2 border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Field</TableHead>
              <TableHead>Table</TableHead>
              <TableHead>Column</TableHead>
              <TableHead>Lineage</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sampleFields.map((field, i) => (
              <TableRow key={i}>
                <TableCell className="font-names">{field.path}</TableCell>
                <TableCell className="font-names">
                  {field.table ? (
                    <a href="#" className="underline underline-offset-4">
                      {field.table}
                    </a>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell className="font-names">{field.column ?? "—"}</TableCell>
                <TableCell>
                  {field.confidence === "probable" ? (
                    <HoverCard>
                      <HoverCardTrigger render={<span className="cursor-help" />}>
                        <ConfidenceBadge confidence="probable" />
                      </HoverCardTrigger>
                      <HoverCardContent className="space-y-1 text-sm">
                        <p className="font-medium">Probable, not stated</p>
                        <p>
                          The catalog says <span className="font-names">{field.raw}</span>. The column is our best guess
                          from that name.
                        </p>
                      </HoverCardContent>
                    </HoverCard>
                  ) : (
                    <ConfidenceBadge confidence={field.confidence} />
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ScrollArea>
    </Section>
  )
}

function ApiDetail() {
  const [version, setVersion] = useState<string | null>("2.1.0")
  return (
    <Section title="API detail parts" usedOn="API detail, compare versions">
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-2">
          <Label>Version (select)</Label>
          <Select value={version} onValueChange={(v) => setVersion(v as string | null)} items={sampleVersions}>
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sampleVersions.map((v) => (
                <SelectItem key={v.value} value={v.value}>
                  <span className="font-names">{v.label}</span>
                  <span className="text-muted-foreground"> · {v.note}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Version (searchable combobox)</Label>
          <Combobox items={sampleVersions.map((v) => `${v.label} (${v.note})`)}>
            <ComboboxInput placeholder="Type a version…" className="w-56" />
            <ComboboxContent>
              <ComboboxEmpty>No matching version.</ComboboxEmpty>
              <ComboboxList>
                {(item: string) => (
                  <ComboboxItem key={item} value={item}>
                    {item}
                  </ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
        </div>
      </div>
      <Tabs defaultValue="fields">
        <TabsList>
          <TabsTrigger value="fields">Fields</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="parameters">Query parameters</TabsTrigger>
        </TabsList>
        <TabsContent value="fields" className="space-y-3 pt-2">
          <Accordion>
            <AccordionItem value="allocations">
              <AccordionTrigger>
                <span className="font-names">widgetDetails.allocations</span>
              </AccordionTrigger>
              <AccordionContent>
                <ul className="space-y-1 text-sm">
                  <li>
                    <span className="font-names">id</span> → <span className="font-names">SXRWIDG_ID</span>{" "}
                    <ConfidenceBadge confidence="stated" />
                  </li>
                  <li>
                    <span className="font-names">rank</span> → <span className="font-names">SXBGADG_RANK_IND</span>{" "}
                    <ConfidenceBadge confidence="probable" />
                  </li>
                </ul>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="owner">
              <AccordionTrigger>
                <span className="font-names">owner</span>
              </AccordionTrigger>
              <AccordionContent>
                <span className="font-names">owner.id</span> → <span className="font-names">GXBWOMB_OWNER_ID</span>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
          <Collapsible className="border-2 border-border p-3">
            <CollapsibleTrigger render={<Button variant="ghost" size="sm" />}>
              <ChevronsUpDown /> How <span className="font-names">status</span> is worked out (derived logic)
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2 text-sm">{sampleDerivedLogic}</CollapsibleContent>
          </Collapsible>
        </TabsContent>
        <TabsContent value="details" className="pt-2 text-sm">
          Family: Banner Business · Type: business · Source: Banner Student · Main table:{" "}
          <span className="font-names">SXRWIDG</span>
        </TabsContent>
        <TabsContent value="parameters" className="pt-2 text-sm">
          <span className="font-names">criteria</span>, <span className="font-names">offset</span>,{" "}
          <span className="font-names">limit</span>
        </TabsContent>
      </Tabs>
    </Section>
  )
}

function SearchSection() {
  const [derived, setDerived] = useState(true)
  const [descriptions, setDescriptions] = useState(false)
  return (
    <Section title="Search" usedOn="search, every page header">
      <InputGroup className="max-w-xl">
        <InputGroupAddon>
          <Search />
        </InputGroupAddon>
        <InputGroupInput placeholder="Search APIs, tables, columns…" defaultValue="sxrwidj" />
      </InputGroup>
      <div className="flex flex-wrap gap-6">
        <div className="flex items-center gap-2">
          <Switch id="derived" checked={derived} onCheckedChange={setDerived} />
          <Label htmlFor="derived">Search derived logic</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch id="descriptions" checked={descriptions} onCheckedChange={setDescriptions} />
          <Label htmlFor="descriptions">Search descriptions</Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox id="checkbox-alt" defaultChecked />
          <Label htmlFor="checkbox-alt">(Checkbox, for comparison)</Label>
        </div>
      </div>
      <p className="text-sm">
        No results. Did you mean{" "}
        {sampleSuggestions.map((s, i) => (
          <span key={s}>
            <Button variant="link" className="h-auto p-0 font-names">
              {s}
            </Button>
            {i < sampleSuggestions.length - 1 ? ", " : ""}
          </span>
        ))}
        ?
      </p>
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
        <Command className="border-2 border-border shadow-md">
          <CommandInput placeholder="Quick search (the Ctrl+K palette)…" />
          <CommandList>
            <CommandEmpty>Nothing found.</CommandEmpty>
            <CommandGroup heading="APIs">
              {sampleApis.map((api) => (
                <CommandItem key={api.name}>
                  <span className="font-names">{api.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandGroup heading="Tables">
              <CommandItem>
                <TableProperties /> <span className="font-names">SXRWIDG</span>
              </CommandItem>
              <CommandItem>
                <TableProperties /> <span className="font-names">GXVTHNG</span>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
        <Popover>
          <PopoverTrigger render={<Button variant="outline" />}>Search tips</PopoverTrigger>
          <PopoverContent>
            <PopoverHeader>
              <PopoverTitle>Search tips</PopoverTitle>
              <PopoverDescription>
                Part of a name works: <span className="font-names">PIDM</span> finds{" "}
                <span className="font-names">SXRWIDG_PIDM</span>.
              </PopoverDescription>
            </PopoverHeader>
          </PopoverContent>
        </Popover>
      </div>
    </Section>
  )
}

function Notices() {
  return (
    <Section title="Notices, progress, messages" usedOn="first run, catalog update, everywhere">
      <Alert>
        <FolderOpen />
        <AlertTitle>Your catalog has changed since it was last read</AlertTitle>
        <AlertDescription>Re-read it to bring the app up to date. It takes about 40 seconds, and you can keep browsing meanwhile.</AlertDescription>
      </Alert>
      <Alert variant="destructive">
        <AlertTitle>Couldn't find a catalog</AlertTitle>
        <AlertDescription>There's no catalog in the folder you gave. Check the path and try again.</AlertDescription>
      </Alert>
      <div className="space-y-2">
        <p className="text-sm">Indexing: 2,714 of 4,378 specs</p>
        <Progress value={62} />
      </div>
      <div className="flex items-center gap-2 text-sm">
        <Spinner /> Reading the catalog…
      </div>
      <Field className="max-w-xl">
        <FieldLabel htmlFor="catalog-path">Catalog folder</FieldLabel>
        <Input id="catalog-path" placeholder="C:\Users\you\Downloads\APICatalog" className="font-names" />
        <FieldDescription>Right-click the folder in File Explorer and choose "Copy as path", then paste it here.</FieldDescription>
      </Field>
      <div className="flex flex-wrap gap-3">
        <Button variant="outline" onClick={() => toast.success("Re-index finished", { description: "12 APIs changed since the last index." })}>
          Show a success toast
        </Button>
        <Button variant="outline" onClick={() => toast.warning("Some specs couldn't be read", { description: "3 files were skipped." })}>
          Show a warning toast
        </Button>
        <Button variant="outline" onClick={() => toast.error("Indexing failed")}>
          Show an error toast
        </Button>
      </div>
    </Section>
  )
}

function SettingsAndDialogs() {
  return (
    <Section title="Settings panel and dialogs" usedOn="settings, re-index">
      <div className="flex flex-wrap gap-3">
        <Sheet>
          <SheetTrigger render={<Button variant="outline" />}>
            <Settings /> Open settings panel
          </SheetTrigger>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>Settings</SheetTitle>
              <SheetDescription>Saved in this browser.</SheetDescription>
            </SheetHeader>
            <div className="space-y-6 px-4">
              <div className="space-y-3">
                <Label>Accent colour</Label>
                {/* Switches the accent live so the presets can be compared; not saved (Settings does that). */}
                <RadioGroup
                  defaultValue={document.documentElement.dataset.accent ?? DEFAULT_ACCENT}
                  onValueChange={(value) => showAccent(value as AccentId)}
                  className="grid grid-cols-2 gap-2"
                >
                  {ACCENTS.map((a) => (
                    <div key={a.id} className="flex items-center gap-2">
                      <RadioGroupItem value={a.id} id={`accent-${a.id}`} />
                      <span className="size-4 border-2 border-black" style={{ backgroundColor: a.hex }} />
                      <Label htmlFor={`accent-${a.id}`}>{a.name}</Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>
              <div className="space-y-2">
                <Label>Catalog</Label>
                <p className="font-names text-sm break-all">C:\Users\you\Downloads\APICatalog</p>
                <Button>Re-index now</Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>
        <Dialog>
          <DialogTrigger render={<Button variant="outline" />}>Open a dialog</DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>About lineage confidence</DialogTitle>
              <DialogDescription>
                "Stated" means the catalog names the table and column. "Probable" means we worked it out from a field
                name.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button>Got it</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <AlertDialog>
          <AlertDialogTrigger render={<Button variant="outline" />}>Re-index (confirm)</AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Re-index the catalog now?</AlertDialogTitle>
              <AlertDialogDescription>This takes 1–2 minutes. You can keep browsing the current index meanwhile.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Not now</AlertDialogCancel>
              <AlertDialogAction>Re-index</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Section>
  )
}
