import { useEffect } from 'react'

/**
 * A list shows page `page` of `data`. If a change (archiving the only row on the last
 * page, approving the last request) leaves that page empty while earlier pages exist,
 * step back to the last page that is left, so the pager never points past the end.
 *
 * @param {{ items: any[], totalPages: number }|undefined} data the list answer
 * @param {number} page the page number being shown
 * @param {(page: number) => void} setPage the page's own setter (stable between renders)
 */
export function useLastPage(data, page, setPage) {
  useEffect(() => {
    if (data && page > 1 && data.items.length === 0) setPage(Math.max(1, data.totalPages))
  }, [data, page, setPage])
}
