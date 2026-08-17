import { useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import {
  navItemsForProfile,
  type NavGroupItem,
  type NavLinkItem,
} from '@/config/navigation'
import {
  filterNavItemsByMenuKeys,
  profileUsesMenuKeys,
} from '@/lib/menuAccess'
import { useAssociadoAcaoEntreAmigos } from '@/hooks/useAssociadoAcaoEntreAmigos'
import { isAssociadoLogin } from '@/lib/roles'

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
  const { profile, empresa, roleLabel, hasPermission, isSuperAdmin, signOut } =
    useAuth()
  const location = useLocation()
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})
  const [menuOpen, setMenuOpen] = useState(false)

  const { loading: acaoMenuLoading, temAcao } = useAssociadoAcaoEntreAmigos()

  const allItems = useMemo(() => {
    const base = navItemsForProfile(profile)
    // Associado: navItemsForProfile já aplica menu_keys (+ Projetos).
    if (isAssociadoLogin(profile) || !profileUsesMenuKeys(profile)) return base

    const filtered = filterNavItemsByMenuKeys(base, profile?.menu_keys)
    // Equipe (e-mail): Cadastros fica disponível conforme o papel, mesmo se
    // menu_keys omitir esses itens.
    const cadastros = base.find(
      (item) => item.type === 'group' && item.id === 'cadastros',
    )
    if (!cadastros || cadastros.type !== 'group') return filtered
    const idx = filtered.findIndex(
      (item) => item.type === 'group' && item.id === 'cadastros',
    )
    if (idx >= 0) {
      return filtered.map((item, i) =>
        i === idx ? { ...cadastros, children: cadastros.children } : item,
      )
    }
    const after = filtered.findIndex(
      (item) => item.type === 'link' && item.to === '/conquistas',
    )
    const pos = after >= 0 ? after + 1 : filtered.length
    return [...filtered.slice(0, pos), cadastros, ...filtered.slice(pos)]
  }, [profile])

  const items = useMemo(() => {
    const filtered = allItems.filter((item) => {
      if (item.type === 'link') {
        if (
          item.to === '/vendas/acao-entre-amigos' &&
          isAssociadoLogin(profile) &&
          (acaoMenuLoading || !temAcao)
        ) {
          return false
        }
        return !item.permission || hasPermission(item.permission)
      }
      if (item.anyOf && !item.anyOf.some((p) => hasPermission(p))) {
        return false
      }
      return groupHasVisibleChild(item, hasPermission)
    })

    // Associado com faixa: garante o item no menu mesmo sem menu_keys.
    if (
      isAssociadoLogin(profile) &&
      !acaoMenuLoading &&
      temAcao &&
      hasPermission('vendas.view') &&
      !filtered.some(
        (item) =>
          item.type === 'link' && item.to === '/vendas/acao-entre-amigos',
      )
    ) {
      filtered.push({
        type: 'link',
        to: '/vendas/acao-entre-amigos',
        label: 'Ação entre amigos',
        permission: 'vendas.view',
      })
    }

    // Eventos: sempre visível para quem tem vendas.view (todos os usuários).
    if (hasPermission('vendas.view')) {
      const hasEventosLink = filtered.some(
        (item) =>
          (item.type === 'link' && item.to === '/vendas/eventos') ||
          (item.type === 'group' &&
            item.children.some((c) => c.to === '/vendas/eventos')),
      )
      if (!hasEventosLink) {
        if (isAssociadoLogin(profile)) {
          filtered.push({
            type: 'link',
            to: '/vendas/eventos',
            label: 'Comprar convites',
            permission: 'vendas.view',
          })
        } else {
          const vendasIdx = filtered.findIndex(
            (item) => item.type === 'group' && item.id === 'vendas',
          )
          const eventoChild = {
            type: 'link' as const,
            to: '/vendas/eventos',
            label: 'Eventos',
            permission: 'vendas.view' as const,
          }
          if (vendasIdx >= 0) {
            const group = filtered[vendasIdx]
            if (group.type === 'group') {
              filtered[vendasIdx] = {
                ...group,
                children: [...group.children, eventoChild],
              }
            }
          } else {
            filtered.push({
              type: 'group',
              id: 'vendas',
              label: 'Vendas',
              anyOf: ['vendas.view'],
              children: [eventoChild],
            })
          }
        }
      }
    }

    // Ordem fixa no topo: Dashboard → Calendário.
    const ordemTopo = ['/dashboard', '/calendario'] as const
    const topo = ordemTopo
      .map((to) =>
        filtered.find((item) => item.type === 'link' && item.to === to),
      )
      .filter((item): item is (typeof filtered)[number] => item != null)
    const resto = filtered.filter(
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

  const grupoLabel = isSuperAdmin
    ? 'Plataforma · todos os grupos'
    : (empresa?.nome ?? 'Grupo Escoteiro')

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
        <Outlet />
      </main>
    </div>
  )
}
