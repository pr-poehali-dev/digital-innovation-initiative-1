import { useState } from "react";
import { deptFunctionsApi } from "@/lib/api";
import Icon from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/use-toast";

type OrgNode = { id: number; code: string; name: string; type: string; parent_id: number | null; own_count: number };

const TYPE_OPTIONS = [
  { value: "management", label: "Управление" },
  { value: "division", label: "Отдел" },
  { value: "group", label: "Группа" },
  { value: "center", label: "Центр" },
];

interface Props {
  projectId: number;
  nodes: OrgNode[];
  selected: OrgNode | null;
  onReload: () => void;
}

export default function OrgUnitEditor({ projectId, nodes, selected, onReload }: Props) {
  const [addOpen, setAddOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("division");
  const [renameName, setRenameName] = useState("");

  const openAdd = () => {
    setNewCode(selected ? `${selected.code}.` : "");
    setNewName("");
    setNewType("division");
    setAddOpen(true);
  };
  const openRename = () => {
    if (!selected) return;
    setRenameName(selected.name);
    setRenameOpen(true);
  };

  const doAdd = () => {
    if (!newCode.trim() || !newName.trim()) {
      toast({ title: "Заполните код и название", variant: "destructive" });
      return;
    }
    setBusy(true);
    deptFunctionsApi.createOrgUnit({
      project_id: projectId,
      code: newCode.trim(),
      name: newName.trim(),
      type: newType,
      parent_id: selected ? selected.id : null,
    })
      .then(() => { toast({ title: "Узел добавлен" }); setAddOpen(false); onReload(); })
      .catch((e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }))
      .finally(() => setBusy(false));
  };

  const doRename = () => {
    if (!selected || !renameName.trim()) return;
    setBusy(true);
    deptFunctionsApi.renameOrgUnit({ project_id: projectId, org_unit_id: selected.id, name: renameName.trim() })
      .then(() => { toast({ title: "Переименовано" }); setRenameOpen(false); onReload(); })
      .catch((e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }))
      .finally(() => setBusy(false));
  };

  const doArchive = () => {
    if (!selected) return;
    if (!confirm(`Архивировать узел «${selected.name}»?`)) return;
    setBusy(true);
    deptFunctionsApi.archiveOrgUnit({ project_id: projectId, org_unit_id: selected.id })
      .then(() => { toast({ title: "Узел архивирован" }); onReload(); })
      .catch((e: Error) => toast({ title: "Нельзя архивировать", description: e.message, variant: "destructive" }))
      .finally(() => setBusy(false));
  };

  const hasChildren = selected ? nodes.some((n) => n.parent_id === selected.id) : false;
  const archiveBlocked = !selected || hasChildren || (selected.own_count > 0);

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={openAdd}>
        <Icon name="Plus" size={13} className="mr-1" /> {selected ? "Дочерний узел" : "Узел"}
      </Button>
      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={openRename} disabled={!selected}>
        <Icon name="Pencil" size={13} className="mr-1" /> Переименовать
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-xs text-red-600 hover:text-red-700"
        onClick={doArchive}
        disabled={archiveBlocked || busy}
        title={archiveBlocked ? "Нельзя: есть дочерние узлы или привязанные функции" : "Архивировать"}
      >
        <Icon name="Archive" size={13} className="mr-1" /> Архивировать
      </Button>

      {/* Добавление */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selected ? `Дочерний узел для «${selected.name}»` : "Новый узел"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Код (например {selected ? `${selected.code}.1` : "4.1"})</Label>
              <Input value={newCode} onChange={(e) => setNewCode(e.target.value)} placeholder="4.1.1" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Название</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Отдел ..." className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Тип</Label>
              <Select value={newType} onValueChange={setNewType}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={busy}>Отмена</Button>
            <Button onClick={doAdd} disabled={busy}>Добавить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Переименование */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Переименовать узел</DialogTitle>
          </DialogHeader>
          <div>
            <Label className="text-xs">Название</Label>
            <Input value={renameName} onChange={(e) => setRenameName(e.target.value)} className="mt-1" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)} disabled={busy}>Отмена</Button>
            <Button onClick={doRename} disabled={busy}>Сохранить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
