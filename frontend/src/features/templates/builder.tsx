'use client';
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, rectSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Eye, GripVertical, Plus, Rocket, Save, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge, Button, Checkbox, Dialog, Field, Input, Select, Textarea } from '@/components/ui';
import { Preview } from '@/features/invoices/invoice-detail';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';
import { CustomFieldsPanel } from './custom-fields';
import { ImagePicker } from './image-picker';
import { SECTION_LABELS, SECTION_TYPES, withLayoutDefaults, type Align, type Section, type SectionType, type Template, type TemplateConfig } from './types';
import type { Id } from '@/lib/ids';

const HALF_BY_DEFAULT: SectionType[] = ['invoice_details', 'customer_details', 'bank_details', 'signature', 'qr_code', 'logo'];

export function TemplateBuilder({ template }: { template: Template }) {
  const qc = useQueryClient();
  const { can } = useSession();
  const latest = template.versions[0];
  const [config, setConfig] = useState<TemplateConfig>(() => withLayoutDefaults(latest.config));
  const [selected, setSelected] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [preview, setPreview] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [makeDefault, setMakeDefault] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const editable = can('template.manage');

  const update = (fn: (c: TemplateConfig) => TemplateConfig) => { setConfig(fn); setDirty(true); };
  const patchSection = (id: string, patch: Partial<Section>) => update((c) => ({ ...c, sections: c.sections.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));
  const add = (type: SectionType) => {
    const id = `s${Date.now().toString(36)}`;
    update((c) => ({ ...c, sections: [...c.sections, { id, type, width: HALF_BY_DEFAULT.includes(type) ? 'half' : 'full', props: {} }] }));
    setSelected(id);
  };
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    update((c) => {
      const from = c.sections.findIndex((s) => s.id === active.id);
      const to = c.sections.findIndex((s) => s.id === over.id);
      return { ...c, sections: arrayMove(c.sections, from, to) };
    });
  };

  const refresh = () => qc.invalidateQueries({ queryKey: ['template', template.id] });
  const save = useMutation({
    mutationFn: () => api(`/invoice-templates/${template.id}/versions`, { body: { config } }),
    onSuccess: () => { toast.success('Draft saved'); setDirty(false); refresh(); },
  });
  const publish = useMutation({
    mutationFn: async (makeDefault: boolean) => {
      if (dirty || latest.status !== 'DRAFT') await api(`/invoice-templates/${template.id}/versions`, { body: { config } });
      return api(`/invoice-templates/${template.id}/publish`, { body: { makeDefault } });
    },
    onSuccess: () => { toast.success('Template published'); setDirty(false); setPublishing(false); refresh(); qc.invalidateQueries({ queryKey: ['/invoice-templates'] }); },
  });

  const sel = config.sections.find((s) => s.id === selected);

  return (
    <div className="-m-4 flex flex-col lg:-m-8 lg:h-[calc(100vh-4rem)]">
      <div className="flex flex-wrap items-center gap-3 border-b bg-surface px-4 py-3">
        <Link href="/app/templates" className="rounded-md p-1.5 text-fg-muted hover:bg-muted"><ArrowLeft className="size-4" /></Link>
        <div className="mr-auto">
          <p className="font-semibold">{template.name}</p>
          <p className="text-xs text-fg-muted">{template.service.name} · v{latest.version} <Badge value={dirty ? 'DRAFT' : latest.status} className="ml-1" /></p>
        </div>
        <Button variant="secondary" onClick={() => setPreview(true)}><Eye className="size-4" /> Preview</Button>
        {editable && <Button variant="secondary" loading={save.isPending} disabled={!dirty} onClick={() => save.mutate()}><Save className="size-4" /> Save draft</Button>}
        {can('template.publish') && (
          <Button loading={publish.isPending} onClick={() => setPublishing(true)}><Rocket className="size-4" /> Publish</Button>
        )}
      </div>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[220px_1fr_300px]">
        <aside className="border-b bg-surface p-3 lg:overflow-y-auto lg:border-b-0 lg:border-r">
          <p className="px-1 pb-2 text-xs font-semibold uppercase tracking-wider text-fg-muted">Blocks</p>
          <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-1">
            {SECTION_TYPES.map((t) => (
              <button key={t} disabled={!editable} onClick={() => add(t)} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted disabled:opacity-50">
                <Plus className="size-3.5 text-fg-muted" /> {SECTION_LABELS[t]}
              </button>
            ))}
          </div>
          <CustomFieldsPanel serviceId={template.serviceId} editable={editable} />
        </aside>

        <div className="bg-bg p-6 lg:overflow-y-auto" onClick={() => setSelected(null)}>
          <div
            className="mx-auto flex max-w-[720px] flex-col rounded-lg bg-white p-8 text-slate-800 shadow-lg"
            style={{ fontFamily: config.theme.fontFamily, fontSize: config.theme.baseFontSize, aspectRatio: config.footer.pinToBottom ? pageRatio(config.page) : undefined }}
          >
            <Region label="Header" active={selected === 'header'} onSelect={() => setSelected('header')}
              className={cn('mb-4 pb-3', config.header.divider && 'border-b-[3px]')} style={{ borderColor: config.theme.accentColor }}>
              <Columns pieces={[
                [config.header.logoPosition, config.header.logo !== 'none' && <LogoBox key="logo" label={config.header.logo === 'header_logo' ? 'Header logo' : 'Brand logo'} size={config.header.logoSize} />],
                [config.header.nameAlign, config.header.showCompanyName && <div key="name"><p className="font-bold leading-tight" style={{ color: config.theme.primaryColor, fontSize: config.header.nameSize }}>Brand name</p><p className="text-[0.85em] text-slate-400">Tagline (if set in Brands)</p></div>],
                [config.header.contactAlign, <p key="contact" className="text-slate-500" style={{ fontSize: config.header.contactSize }}>{config.header.showContact && <>Address<br />Phone · Email<br /></>}GSTIN</p>],
              ]} />
            </Region>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={config.sections.map((s) => s.id)} strategy={rectSortingStrategy}>
                <div className="flex flex-1 flex-wrap content-start gap-3">
                  {config.sections.map((s) => (
                    <Block key={s.id} s={s} active={s.id === selected} primary={config.theme.primaryColor} editable={editable}
                      onSelect={() => setSelected(s.id)} onRemove={() => update((c) => ({ ...c, sections: c.sections.filter((x) => x.id !== s.id) }))} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
            {config.sections.length === 0 && <p className="py-16 text-center text-sm text-slate-400">Add blocks from the left panel</p>}
            <Region label="Footer" active={selected === 'footer'} onSelect={() => setSelected('footer')} className="mt-6 border-t pt-2">
              <Columns pieces={[
                [config.footer.textAlign, <p key="text" className="whitespace-pre-line text-slate-500" style={{ fontSize: config.footer.textSize }}>{[config.footer.showTerms && 'Terms & conditions', config.footer.text].filter(Boolean).join('\n') || 'Footer text'}</p>],
                [config.footer.contactAlign, config.footer.showContact && <p key="contact" className="text-slate-500" style={{ fontSize: config.footer.contactSize }}>Address · Phone · Email · Website</p>],
                [config.footer.logoPosition, config.footer.logo !== 'none' && <LogoBox key="logo" label="Footer logo" size={config.footer.logoSize} />],
              ]} />
            </Region>
          </div>
        </div>

        <aside className="border-t bg-surface p-4 lg:overflow-y-auto lg:border-l lg:border-t-0">
          <fieldset disabled={!editable} className="space-y-5">
            {selected === 'header' ? <HeaderInspector c={config} update={update} />
              : selected === 'footer' ? <FooterInspector c={config} update={update} />
              : sel ? <SectionInspector s={sel} serviceId={template.serviceId} onChange={(p) => patchSection(sel.id, p)} />
              : <DocumentInspector c={config} update={update} />}
          </fieldset>
        </aside>
      </div>

      <Dialog open={preview} onClose={() => setPreview(false)} title="Preview with sample data" wide>
        {preview && <Preview path={`/invoice-templates/${template.id}/preview`} body={{ config }} />}
      </Dialog>
      <Dialog
        open={publishing}
        onClose={() => setPublishing(false)}
        title="Publish this template?"
        size="sm"
        footer={<><Button variant="secondary" onClick={() => setPublishing(false)}>Cancel</Button><Button loading={publish.isPending} onClick={() => publish.mutate(makeDefault)}><Rocket className="size-4" /> Publish</Button></>}
      >
        <p className="text-sm text-fg-muted">If this is the brand’s default template, the published version is used for all of the brand’s invoices, including ones already issued.</p>
        <Checkbox className="mt-4" label="Make this the brand’s default template" description="New invoices for this brand will start with it." checked={makeDefault} onChange={(e) => setMakeDefault(e.target.checked)} />
      </Dialog>
    </div>
  );
}

function Block({ s, active, primary, editable, onSelect, onRemove }: { s: Section; active: boolean; primary: string; editable: boolean; onSelect: () => void; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: s.id, disabled: !editable });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
      className={cn('group relative flex min-h-14 items-center gap-2 rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-sm', s.width === 'half' ? 'w-[calc(50%-0.375rem)]' : 'w-full', active && 'border-solid border-indigo-500 ring-2 ring-indigo-200', isDragging && 'z-10 opacity-70 shadow-lg')}
    >
      <button {...attributes} {...listeners} className="cursor-grab text-slate-400 active:cursor-grabbing" aria-label="Drag"><GripVertical className="size-4" /></button>
      <span className="font-medium" style={{ color: primary }}>{SECTION_LABELS[s.type]}</span>
      {s.type === 'custom_text' && typeof s.props.text === 'string' && <span className="truncate text-xs text-slate-500">— {s.props.text}</span>}
      {editable && <button onClick={(e) => { e.stopPropagation(); onRemove(); }} className="ml-auto hidden text-slate-400 hover:text-red-600 group-hover:block" aria-label="Remove"><Trash2 className="size-4" /></button>}
    </div>
  );
}

function SectionInspector({ s, serviceId, onChange }: { s: Section; serviceId: Id; onChange: (p: Partial<Section>) => void }) {
  const prop = (k: string, v: unknown) => onChange({ props: { ...s.props, [k]: v } });
  return (
    <>
      <p className="font-semibold">{SECTION_LABELS[s.type]}</p>
      <Field label="Width">
        <Select value={s.width} onChange={(e) => onChange({ width: e.target.value as Section['width'] })}><option value="full">Full width</option><option value="half">Half width</option></Select>
      </Field>
      {s.type === 'custom_text' && <Field label="Text"><Textarea value={String(s.props.text ?? '')} onChange={(e) => prop('text', e.target.value)} /></Field>}
      {s.type === 'custom_field' && <Field label="Field key" hint="Key of a custom field defined for this brand"><Input value={String(s.props.fieldKey ?? '')} onChange={(e) => prop('fieldKey', e.target.value)} /></Field>}
      {s.type === 'custom_image' && <ImagePicker serviceId={serviceId} value={String(s.props.imageKey ?? '')} onChange={(k) => prop('imageKey', k)} />}
      {s.type === 'qr_code' && <>
        <p className="text-xs text-fg-muted">Upload your payment QR (PhonePe, GPay, Paytm or bank). Without one, a QR is generated from the brand’s UPI ID. It’s hidden once the invoice is fully paid.</p>
        <ImagePicker serviceId={serviceId} value={String(s.props.imageKey ?? '')} onChange={(k) => prop('imageKey', k)} />
        {Boolean(s.props.imageKey) && <Button variant="secondary" size="sm" onClick={() => prop('imageKey', '')}>Use UPI ID instead</Button>}
      </>}
      <p className="text-xs text-fg-muted">Drag blocks on the canvas to reorder. Click empty space to edit document settings.</p>
    </>
  );
}

type Updater = (fn: (c: TemplateConfig) => TemplateConfig) => void;
const setter = (update: Updater) => <K extends keyof TemplateConfig>(k: K, patch: Partial<TemplateConfig[K]>) => update((x) => ({ ...x, [k]: { ...(x[k] as object), ...patch } }));

function DocumentInspector({ c, update }: { c: TemplateConfig; update: Updater }) {
  const set = setter(update);
  return (
    <>
      <p className="font-semibold">Document</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Page"><Select value={c.page.size} onChange={(e) => set('page', { size: e.target.value as 'A4' })}><option>A4</option><option>LETTER</option></Select></Field>
        <Field label="Orientation"><Select value={c.page.orientation} onChange={(e) => set('page', { orientation: e.target.value as 'portrait' })}><option value="portrait">Portrait</option><option value="landscape">Landscape</option></Select></Field>
      </div>
      <p className="pt-2 text-sm font-semibold">Theme</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Primary"><input type="color" value={c.theme.primaryColor} onChange={(e) => set('theme', { primaryColor: e.target.value })} className="h-9 w-full rounded-lg border" /></Field>
        <Field label="Accent"><input type="color" value={c.theme.accentColor} onChange={(e) => set('theme', { accentColor: e.target.value })} className="h-9 w-full rounded-lg border" /></Field>
      </div>
      <Field label="Font">
        <Select value={c.theme.fontFamily} onChange={(e) => set('theme', { fontFamily: e.target.value })}>
          {['Inter, Arial, sans-serif', 'Georgia, serif', 'Helvetica, Arial, sans-serif', "'Courier New', monospace"].map((f) => <option key={f} value={f}>{f.split(',')[0].replace(/'/g, '')}</option>)}
        </Select>
      </Field>
      <Field label={`Base font size (${c.theme.baseFontSize}px)`}><input type="range" min={8} max={16} value={c.theme.baseFontSize} onChange={(e) => set('theme', { baseFontSize: Number(e.target.value) })} /></Field>
      <p className="text-xs text-fg-muted">Click the header or footer on the canvas to change its layout.</p>
    </>
  );
}

function HeaderInspector({ c, update }: { c: TemplateConfig; update: Updater }) {
  const set = setter(update);
  const h = c.header;
  return (
    <>
      <p className="font-semibold">Header</p>
      <Field label="Logo"><Select value={h.logo} onChange={(e) => set('header', { logo: e.target.value as 'none' })}><option value="service_logo">Brand logo</option><option value="header_logo">Header logo</option><option value="none">None</option></Select></Field>
      {h.logo !== 'none' && <>
        <AlignPicker label="Logo position" value={h.logoPosition} onChange={(v) => set('header', { logoPosition: v })} />
        <Range label="Logo size" min={24} max={160} value={h.logoSize} onChange={(v) => set('header', { logoSize: v })} />
      </>}
      <Check label="Show brand name" checked={h.showCompanyName} onChange={(v) => set('header', { showCompanyName: v })} />
      {h.showCompanyName && <>
        <AlignPicker label="Brand name position" value={h.nameAlign} onChange={(v) => set('header', { nameAlign: v })} />
        <Range label="Brand name size" min={12} max={40} value={h.nameSize} onChange={(v) => set('header', { nameSize: v })} />
      </>}
      <Check label="Show contact details" checked={h.showContact} onChange={(v) => set('header', { showContact: v })} />
      <AlignPicker label="Contact / GSTIN position" value={h.contactAlign} onChange={(v) => set('header', { contactAlign: v })} />
      <Range label="Contact text size" min={7} max={16} value={h.contactSize} onChange={(v) => set('header', { contactSize: v })} />
      <Check label="Divider line under header" checked={h.divider} onChange={(v) => set('header', { divider: v })} />
      <p className="text-xs text-fg-muted">Items placed in the same position stack on top of each other.</p>
    </>
  );
}

function FooterInspector({ c, update }: { c: TemplateConfig; update: Updater }) {
  const set = setter(update);
  const f = c.footer;
  return (
    <>
      <p className="font-semibold">Footer</p>
      <Check label="Keep footer at the bottom of the page" checked={f.pinToBottom} onChange={(v) => set('footer', { pinToBottom: v })} />
      <Field label="Logo"><Select value={f.logo} onChange={(e) => set('footer', { logo: e.target.value as 'none' })}><option value="footer_logo">Footer logo</option><option value="none">None</option></Select></Field>
      {f.logo !== 'none' && <>
        <AlignPicker label="Logo position" value={f.logoPosition} onChange={(v) => set('footer', { logoPosition: v })} />
        <Range label="Logo size" min={16} max={120} value={f.logoSize} onChange={(v) => set('footer', { logoSize: v })} />
      </>}
      <Check label="Show terms in footer" checked={f.showTerms} onChange={(v) => set('footer', { showTerms: v })} />
      <Field label="Footer text"><Textarea value={f.text ?? ''} maxLength={500} onChange={(e) => set('footer', { text: e.target.value })} /></Field>
      <AlignPicker label="Text position" value={f.textAlign} onChange={(v) => set('footer', { textAlign: v })} />
      <Range label="Text size" min={7} max={14} value={f.textSize} onChange={(v) => set('footer', { textSize: v })} />
      <Check label="Show contact details" checked={f.showContact} onChange={(v) => set('footer', { showContact: v })} />
      {f.showContact && <>
        <AlignPicker label="Contact position" value={f.contactAlign} onChange={(v) => set('footer', { contactAlign: v })} />
        <Range label="Contact text size" min={7} max={14} value={f.contactSize} onChange={(v) => set('footer', { contactSize: v })} />
      </>}
    </>
  );
}

function AlignPicker({ label, value, onChange }: { label: string; value: Align; onChange: (v: Align) => void }) {
  return (
    <Field label={label}>
      <div className="grid grid-cols-3 gap-1 rounded-lg border p-1" role="radiogroup" aria-label={label}>
        {(['left', 'center', 'right'] as const).map((a) => (
          <button key={a} type="button" role="radio" aria-checked={value === a} onClick={() => onChange(a)}
            className={cn('rounded-md py-1 text-xs capitalize', value === a ? 'bg-primary text-primary-fg' : 'hover:bg-muted')}>{a}</button>
        ))}
      </div>
    </Field>
  );
}

function Range({ label, min, max, value, onChange }: { label: string; min: number; max: number; value: number; onChange: (v: number) => void }) {
  return <Field label={`${label} (${value}px)`}><input type="range" className="w-full" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} /></Field>;
}

function Region({ label, active, onSelect, className, style, children }: { label: string; active: boolean; onSelect: () => void; className?: string; style?: React.CSSProperties; children: React.ReactNode }) {
  return (
    <div
      role="button" tabIndex={0} aria-label={`Edit ${label.toLowerCase()}`} style={style}
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); } }}
      className={cn('group relative cursor-pointer rounded-sm outline-offset-4 hover:outline hover:outline-1 hover:outline-dashed hover:outline-indigo-300', active && 'outline outline-2 outline-indigo-500', className)}
    >
      <span className={cn('absolute -top-5 left-0 hidden rounded bg-indigo-500 px-1.5 text-[10px] font-medium text-white group-hover:block', active && 'block')}>{label}</span>
      {children}
    </div>
  );
}

/** Mirrors the PDF's 3-column header/footer layout. */
function Columns({ pieces }: { pieces: [Align, React.ReactNode][] }) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-3">
      {(['left', 'center', 'right'] as const).map((pos) => (
        <div key={pos} className={cn('flex flex-col gap-1', pos === 'left' && 'items-start text-left', pos === 'center' && 'items-center text-center', pos === 'right' && 'items-end text-right')}>
          {pieces.filter(([p, node]) => p === pos && node).map(([, node]) => node)}
        </div>
      ))}
    </div>
  );
}

function LogoBox({ label, size }: { label: string; size: number }) {
  return <div className="flex items-center justify-center rounded bg-slate-200 text-[10px] text-slate-500" style={{ height: size, width: size * 2 }}>{label}</div>;
}

const pageRatio = (p: TemplateConfig['page']) => {
  const [w, h] = p.size === 'A4' ? [210, 297] : [215.9, 279.4];
  return p.orientation === 'portrait' ? `${w} / ${h}` : `${h} / ${w}`;
};

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4" checked={checked} onChange={(e) => onChange(e.target.checked)} />{label}</label>;
}
