import { useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import {
  navItemsForProfile,
  type NavGroupItem,
  type NavItem,
  type NavLinkItem,
} from '@/config/navigation'
import {
  filterNavItemsByMenuKeys,
  profileUsesMenuKeys,
} from '@/lib/menuAccess'
import { useAssociadoAcaoEntreAmigos } from '@/hooks/useAssociadoAcaoEntreAmigos'
import { isAssociadoLogin } from '@/lib/roles'
import { PlataformaAcessoBanner } from '@/components/PlataformaAcessoGate'

function groupHasVisibleChild(
  group: NavGroupItem,
  hasPermission: (p: NonNullable<NavLinkItem['permission']>) => boolean,
) {
  return group.children.some(
    (child) => !child.permission || hasPermission(child.permission),
  )
}

function navLinkActive(pathname: string, search: string, to: string) {
  const [path, query = ''] = to.split('?')
  if (pathname !== path && !(path !== '/' && pathname.startsWith(`${path}/`))) {
    // redirect /portal-transparencia → /transparencia/:slug
    if (path === '/portal-transparencia') {
      if (!pathname.startsWith('/transparencia/')) return false
      if (!query) return true
      return search.includes(query) || search === `?${query}`
    }
    return false
  }
  if (!query) return path === '/' ? pathname === '/' : true
  return search.includes(query) || search === `?${query}`
}

export function AppLayout() {
  const {
    profile,
    empresa,
    roleLabel,
    hasPermission,
    isSuperAdmin,
    empresasContexto,
    setActingEmpresaId,
    refreshEmpresasContexto,
    signOut,
  } = useAuth()
  const location = useLocation()
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})
  const [menuOpen, setMenuOpen] = useState(false)

  const { loading: acaoMenuLoading, temAcao } = useAssociadoAcaoEntreAmigos()

  useEffect(() => {
    if (!isSuperAdmin) return
    void refreshEmpresasContexto()
  }, [isSuperAdmin, location.pathname, refreshEmpresasContexto])

  const grupoLabel = isSuperAdmin
    ? empresa?.nome
      ? `Contexto · ${empresa.nome}`
      : 'Plataforma · selecione um grupo'
    : (empresa?.nome ?? 'Grupo Escoteiro')

  const allItems = useMemo(() => {
    const base = navItemsForProfile(profile)
    let result: NavItem[]

    // Associado: navItemsForProfile já aplica menu_keys (+ Projetos).
    if (isAssociadoLogin(profile) || !profileUsesMenuKeys(profile)) {
      result = base
    } else {
      // Equipe: respeita estritamente os menus marcados no cadastro.
      result = filterNavItemsByMenuKeys(base, profile?.menu_keys, {
        associadoLogin: false,
      })
    }

    // Admin do grupo: sempre exibe "Grupo escoteiro" (editar o próprio grupo),
    // mesmo com menu_keys personalizado que omita o item.
    if (profile?.role === 'admin') {
      const already = result.some(
        (item) => item.type === 'link' && item.to === '/grupos/meu',
      )
      if (!already) {
        const grupoMeu: NavItem =
          base.find(
            (item) => item.type === 'link' && item.to === '/grupos/meu',
          ) ?? {
            type: 'link',
            to: '/grupos/meu',
            label: 'Grupo escoteiro',
            permission: 'grupos.view',
          }
        const audIdx = result.findIndex(
          (item) => item.type === 'link' && item.to === '/auditoria',
        )
        result =
          audIdx >= 0
            ? [...result.slice(0, audIdx), grupoMeu, ...result.slice(audIdx)]
            : [...result, grupoMeu]
      }
    }

    return result
  }, [profile])

  const items = useMemo(() => {
    const menuKeys = profileUsesMenuKeys(profile) ? profile?.menu_keys : null
    const filtered = allItems.filter((item) => {
      if (item.type === 'link') {
        if (
          item.to === '/vendas/acao-entre-amigos' &&
          isAssociadoLogin(profile) &&
          (acaoMenuLoading || !temAcao)
        ) {
          return false
        }
        if (!item.permission) return true
        if (hasPermission(item.permission)) return true
        // Menu marcado no cadastro: libera visualização mesmo se o papel base não tiver.
        return menuKeys != null && menuKeys.includes(item.to)
      }
      if (item.anyOf && item.anyOf.some((p) => hasPermission(p))) {
        return groupHasVisibleChild(item, hasPermission) ||
          (menuKeys != null &&
            item.children.some((c) => menuKeys.includes(c.to)))
      }
      // Grupo sem anyOf liberado pelo papel: ainda mostra filhos marcados em menu_keys.
      if (menuKeys != null) {
        const children = item.children.filter(
          (child) =>
            (!child.permission ||
              hasPermission(child.permission) ||
              menuKeys.includes(child.to)),
        )
        return children.length > 0
      }
      return groupHasVisibleChild(item, hasPermission)
    })

    // Quando menu_keys liberou filhos sem permissão do papel, reescreve o grupo.
    const withGrantedChildren = filtered.map((item) => {
      if (item.type !== 'group' || menuKeys == null) return item
      const children = item.children.filter(
        (child) =>
          !child.permission ||
          hasPermission(child.permission) ||
          menuKeys.includes(child.to),
      )
      return { ...item, children }
    })

    const next = [...withGrantedChildren]

    // Associado com faixa: garante o item no menu mesmo sem menu_keys.
    if (
      isAssociadoLogin(profile) &&
      !acaoMenuLoading &&
      temAcao &&
      hasPermission('vendas.view') &&
      !next.some(
        (item) =>
          item.type === 'link' && item.to === '/vendas/acao-entre-amigos',
      )
    ) {
      next.push({
        type: 'link',
        to: '/vendas/acao-entre-amigos',
        label: 'Ação entre amigos',
        permission: 'vendas.view',
      })
    }

    // Associado: Eventos sempre no portal. Equipe: só se marcado em menu_keys.
    if (isAssociadoLogin(profile) && hasPermission('vendas.view')) {
      const hasEventosLink = next.some(
        (item) =>
          (item.type === 'link' && item.to === '/vendas/eventos') ||
          (item.type === 'group' &&
            item.children.some((c) => c.to === '/vendas/eventos')),
      )
      if (!hasEventosLink) {
        next.push({
          type: 'link',
          to: '/vendas/eventos',
          label: 'Comprar convites',
          permission: 'vendas.view',
        })
      }
    }

    // Ordem fixa no topo: Dashboard → Calendário.
    const ordemTopo = ['/dashboard', '/calendario'] as const
    const topo = ordemTopo
      .map((to) =>
        next.find((item) => item.type === 'link' && item.to === to),
      )
      .filter((item): item is (typeof next)[number] => item != null)
    const resto = next.filter(
      (item) =>
        !(
          item.type === 'link' &&
          (item.to === '/dashboard' || item.to === '/calendario')
        ),
    )
    return [...topo, ...resto]
  }, [allItems, hasPermission, profile, acaoMenuLoading, temAcao])

  useEffect(() => {
    setOpenGroups((prev) => {
      const next = { ...prev }
      for (const item of allItems) {
        if (item.type !== 'group') continue
        const childActive = item.children.some((child) =>
          navLinkActive(location.pathname, location.search, child.to),
        )
        if (childActive) next[item.id] = true
      }
      return next
    })
  }, [allItems, location.pathname, location.search])

  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!menuOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)

    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  function toggleGroup(id: string) {
    setOpenGroups((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  // PDV local fullscreen — não incluir /vendas/loja-online
  const hideNav =
    location.pathname === '/vendas/loja' ||
    location.pathname.startsWith('/vendas/loja/')

  return (
    <div
      className={`app-shell${menuOpen ? ' menu-open' : ''}${hideNav ? ' app-shell--hide-nav' : ''}`}
    >
      {!hideNav ? (
        <>
          <header className="mobile-topbar">
            <button
              type="button"
              className="mobile-menu-btn"
              aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <span className="mobile-menu-icon" aria-hidden="true">
                {menuOpen ? '✕' : '☰'}
              </span>
            </button>
            <img
              className="mobile-topbar-logo"
              src={empresa?.logo_url || '/logo-erp.png'}
              alt=""
              width={36}
              height={36}
            />
            <div className="mobile-topbar-text">
              <strong>ERP Escoteiro</strong>
              <span>{grupoLabel}</span>
            </div>
          </header>

          {menuOpen ? (
            <button
              type="button"
              className="sidebar-backdrop"
              aria-label="Fechar menu"
              onClick={() => setMenuOpen(false)}
            />
          ) : null}

          <aside className="sidebar" id="app-sidebar">
            <div className="brand">
              <img
                className="brand-logo"
                src={empresa?.logo_url || '/logo-erp.png'}
                alt={empresa?.nome ?? 'ERP Escoteiro'}
                width={72}
                height={72}
              />
              <p>{grupoLabel}</p>
              {isSuperAdmin ? (
                <div className="field" style={{ marginTop: '0.75rem' }}>
                  <label
                    htmlFor="acting-empresa"
                    style={{ fontSize: '0.75rem' }}
                  >
                    Grupo em contexto
                  </label>
                  <select
                    id="acting-empresa"
                    className="select"
                    value={empresa?.id ?? ''}
                    onChange={(e) => {
                      const v = e.target.value
                      void setActingEmpresaId(v ? Number(v) : null)
                    }}
                  >
                    <option value="">
                      {empresasContexto.length
                        ? 'Selecione um grupo…'
                        : 'Nenhum grupo cadastrado'}
                    </option>
                    {empresasContexto.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.nome}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
            </div>

            <nav className="nav-group" aria-label="Principal">
              <div className="nav-label">Menu</div>
              {items.map((item) => {
                if (item.type === 'link') {
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.end}
                      className={() =>
                        `nav-link${
                          navLinkActive(
                            location.pathname,
                            location.search,
                            item.to,
                          )
                            ? ' active'
                            : ''
                        }`
                      }
                    >
                      {item.label}
                    </NavLink>
                  )
                }

                const open = !!openGroups[item.id]
                const childActive = item.children.some((child) =>
                  navLinkActive(location.pathname, location.search, child.to),
                )
                const visibleChildren = item.children.filter(
                  (child) =>
                    !child.permission || hasPermission(child.permission),
                )

                return (
                  <div
                    key={item.id}
                    className={`nav-submenu${open ? ' open' : ''}${childActive ? ' has-active' : ''}`}
                  >
                    <button
                      type="button"
                      className={`nav-group-toggle${childActive ? ' active' : ''}`}
                      aria-expanded={open}
                      onClick={() => toggleGroup(item.id)}
                    >
                      <span>{item.label}</span>
                      <span className="nav-caret" aria-hidden="true">
                        {open ? '▾' : '▸'}
                      </span>
                    </button>
                    {open ? (
                      <div className="nav-submenu-items">
                        {visibleChildren.map((child) => (
                          <NavLink
                            key={child.to}
                            to={child.to}
                            end={child.end}
                            className={() =>
                              `nav-link nav-sublink${
                                navLinkActive(
                                  location.pathname,
                                  location.search,
                                  child.to,
                                )
                                  ? ' active'
                                  : ''
                              }`
                            }
                          >
                            {child.label}
                          </NavLink>
                        ))}
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </nav>

            <div className="sidebar-footer">
              <strong>{profile?.nome ?? 'Usuário'}</strong>
              <span>{roleLabel ?? profile?.username ?? '—'}</span>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ marginTop: '0.75rem', width: '100%' }}
                onClick={() => void signOut()}
              >
                Sair
              </button>
            </div>
          </aside>
        </>
      ) : null}

      <main className="main">
        <PlataformaAcessoBanner />
        <Outlet />
      </main>
    </div>
  )
}
