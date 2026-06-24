"use client"

/** 
 * 🛡️ GOVERNANÇA OBRIGATÓRIA — LEIA ANTES DE ALTERAR ESTE ARQUIVO
 * ─────────────────────────────────────────────────────────────
 * ⚠️ REGRAS ABSOLUTAS (já causaram DOWNTIME real):
 *
 * 1. NUNCA: git reset --hard | rm -rf | git checkout -- .env
 * 2. NUNCA: altere .env de produção, git remote, DATABASE_URL, API keys
 * 3. NUNCA: crie scripts de deploy alternativos, arquivos temp no root
 * 4. SEMPRE: use deploy-seguro.py para deploy, vozpro-preview para commits
 * 5. SEMPRE: verifique next build passa, .env tem PostgreSQL, token bate
 *
 * 📋 LEIA COMPLETO:
 *    https://github.com/rgdweb/vozpro-preview/blob/main/REGRAS-ERROS-PROIBIDOS.md
 *    https://github.com/rgdweb/vozpro-preview/blob/main/GOVERNANCE.md
 *
 * 13 erros já cometidos que derrubaram o sistema.
 * Se você tocar em qualquer coisa sem ler as regras acima, vai quebrar.
 * ─────────────────────────────────────────────────────────────
 */


import * as React from "react"
import { GripVerticalIcon } from "lucide-react"
import * as ResizablePrimitive from "react-resizable-panels"

import { cn } from "@/lib/utils"

function ResizablePanelGroup({
  className,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.PanelGroup>) {
  return (
    <ResizablePrimitive.PanelGroup
      data-slot="resizable-panel-group"
      className={cn(
        "flex h-full w-full data-[panel-group-direction=vertical]:flex-col",
        className
      )}
      {...props}
    />
  )
}

function ResizablePanel({
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.Panel>) {
  return <ResizablePrimitive.Panel data-slot="resizable-panel" {...props} />
}

function ResizableHandle({
  withHandle,
  className,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.PanelResizeHandle> & {
  withHandle?: boolean
}) {
  return (
    <ResizablePrimitive.PanelResizeHandle
      data-slot="resizable-handle"
      className={cn(
        "bg-border focus-visible:ring-ring relative flex w-px items-center justify-center after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 focus-visible:ring-1 focus-visible:ring-offset-1 focus-visible:outline-hidden data-[panel-group-direction=vertical]:h-px data-[panel-group-direction=vertical]:w-full data-[panel-group-direction=vertical]:after:left-0 data-[panel-group-direction=vertical]:after:h-1 data-[panel-group-direction=vertical]:after:w-full data-[panel-group-direction=vertical]:after:translate-x-0 data-[panel-group-direction=vertical]:after:-translate-y-1/2 [&[data-panel-group-direction=vertical]>div]:rotate-90",
        className
      )}
      {...props}
    >
      {withHandle && (
        <div className="bg-border z-10 flex h-4 w-3 items-center justify-center rounded-xs border">
          <GripVerticalIcon className="size-2.5" />
        </div>
      )}
    </ResizablePrimitive.PanelResizeHandle>
  )
}

export { ResizablePanelGroup, ResizablePanel, ResizableHandle }
