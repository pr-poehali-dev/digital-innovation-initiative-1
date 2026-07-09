import { useState } from "react";
import Layout from "@/components/Layout";
import Icon from "@/components/ui/icon";
import PracticesTab from "@/components/solutions/PracticesTab";
import CapabilitiesTab from "@/components/solutions/CapabilitiesTab";
import ProductsTab from "@/components/solutions/ProductsTab";
import ModulesTab from "@/components/solutions/ModulesTab";

type Tab = "practices" | "capabilities" | "products" | "modules";

export default function SolutionsPage() {
  const [tab, setTab] = useState<Tab>("practices");

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        <div>
          <div className="flex items-center gap-2">
            <Icon name="Lightbulb" size={20} className="text-indigo-500" />
            <h1 className="text-xl font-bold text-slate-800">База решений</h1>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Справочник практик, capability, продуктов и модулей. Только просмотр — наполнение из curated-набора.
          </p>
        </div>

        <div className="flex border-b border-slate-200 overflow-x-auto">
          {([
            { id: "practices", label: "Практики" },
            { id: "capabilities", label: "Capability" },
            { id: "products", label: "Продукты" },
            { id: "modules", label: "Модули" },
          ] as const).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
                tab === t.id ? "border-indigo-500 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "practices" && <PracticesTab />}
        {tab === "capabilities" && <CapabilitiesTab />}
        {tab === "products" && <ProductsTab />}
        {tab === "modules" && <ModulesTab />}
      </div>
    </Layout>
  );
}
