import {
  Chapter,
  ChapterDetails,
  ContentRating,
  HomeSection,
  HomeSectionType,
  Manga,
  MangaStatus,
  MangaTile,
  PagedResults,
  Request,
  RequestManager,
  Response,
  SearchRequest,
  Source,
  SourceInfo,
  Tag,
  TagSection,
} from 'paperback-extensions-common'

const BASE_URL = 'https://manga-tr.com'

export const MangaTRInfo: SourceInfo = {
  name: 'Manga-TR',
  description: "Türkiye'nin en büyük çevrimiçi manga okuma sitesi",
  author: 'DanteZoldyck',
  authorWebsite: 'https://github.com/DanteZoldyck',
  version: '1.0.0',
  icon: 'icon.png',
  contentRating: ContentRating.EVERYONE,
  websiteBaseURL: BASE_URL,
  language: 'tr',
}

export class MangaTR extends Source {
  readonly requestManager: RequestManager = createRequestManager({
    requestsPerSecond: 3,
    requestTimeout: 20000,
    interceptor: {
      interceptRequest: async (request: Request) => {
        request.headers = {
          ...request.headers,
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
          Referer: BASE_URL,
        }
        return request
      },
      interceptResponse: async (response: Response) => response,
    },
  })

  async getMangaDetails(mangaId: string): Promise<Manga> {
    const url = `${BASE_URL}/${mangaId}.html`
    const request = createRequestObject({ url, method: 'GET' })
    const response = await this.requestManager.schedule(request, 1)
    const $ = this.cheerio.load(response.data)

    const title = $('h2.widget-title, h1').first().text().trim() || 'Bilinmiyor'
    const image = $('img.thumbnail, .manga-cover img, .imagebig img').first().attr('src') || ''
    const desc = $('.description-summary, .summary__content, #synopsis').first().text().trim() || ''

    let author = ''
    let status = MangaStatus.ONGOING
    const genres: Tag[] = []

    $('table.table tr, .srepetarz tr').each((_: number, row: cheerio.Element) => {
      const label = $('td', row).first().text().toLowerCase()
      const value = $('td', row).last().text().trim()
      if (label.includes('yazar')) author = value
      if (label.includes('durum')) status = value.toLowerCase().includes('tamam') ? MangaStatus.COMPLETED : MangaStatus.ONGOING
      if (label.includes('tür')) {
        value.split(',').forEach((g: string) => {
          const t = g.trim()
          if (t) genres.push(createTag({ id: t, label: t }))
        })
      }
    })

    if (genres.length === 0) {
      $('a[href*="tur="]').each((_: number, el: cheerio.Element) => {
        const g = $(el).text().trim()
        if (g) genres.push(createTag({ id: g, label: g }))
      })
    }

    const tagSections: TagSection[] = genres.length ? [createTagSection({ id: 'genres', label: 'Türler', tags: genres })] : []

    return createManga({
      id: mangaId,
      titles: [title],
      image: image.startsWith('http') ? image : `${BASE_URL}${image}`,
      status,
      author,
      desc,
      tags: tagSections,
      rating: 0,
    })
  }

  async getChapters(mangaId: string): Promise<Chapter[]> {
    const url = `${BASE_URL}/${mangaId}.html`
    const request = createRequestObject({ url, method: 'GET' })
    const response = await this.requestManager.schedule(request, 1)
    const $ = this.cheerio.load(response.data)
    const chapters: Chapter[] = []

    $('table#chapter_list tr, .chapter-list li, .bolum-list tr').each((i: number, el: cheerio.Element) => {
      const link = $('a[href*="bolum"], a[href*="chapter"]', el).first()
      const href = link.attr('href') || ''
      if (!href) return
      const chapterTitle = link.text().trim()
      const numMatch = chapterTitle.match(/[\d.]+/)
      const chapNum = numMatch ? parseFloat(numMatch[0]) : i
      const chapterId = href.replace('.html', '').split('/').pop() || href
      chapters.push(createChapter({ id: chapterId, mangaId, name: chapterTitle || `Bölüm ${chapNum}`, chapNum, langCode: '🇹🇷' }))
    })

    return chapters.sort((a, b) => b.chapNum - a.chapNum)
  }

  async getChapterDetails(mangaId: string, chapterId: string): Promise<ChapterDetails> {
    const url = `${BASE_URL}/${chapterId}.html`
    const request = createRequestObject({ url, method: 'GET' })
    const response = await this.requestManager.schedule(request, 1)
    const $ = this.cheerio.load(response.data)
    const pages: string[] = []

    $('img.viewer-image, #okuyucu img, .page-image img, img[data-src]').each((_: number, el: cheerio.Element) => {
      const src = $(el).attr('data-src') || $(el).attr('data-lazy-src') || $(el).attr('src') || ''
      if (src && !src.includes('logo') && !src.includes('banner')) {
        pages.push(src.startsWith('http') ? src : `${BASE_URL}${src}`)
      }
    })

    if (pages.length === 0) {
      $('script:not([src])').each((_: number, el: cheerio.Element) => {
        const content = $(el).html() || ''
        const match = content.match(/(?:pages|images|pageUrls|resimler)\s*=\s*(\[.*?\])/s)
        if (match) {
          try {
            const urls: string[] = JSON.parse(match[1])
            urls.forEach((u: string) => pages.push(u.startsWith('http') ? u : `${BASE_URL}${u}`))
          } catch { /* devam */ }
        }
      })
    }

    return createChapterDetails({ id: chapterId, mangaId, pages: [...new Set(pages)], longStrip: true })
  }

  async getSearchResults(query: SearchRequest, metadata: unknown): Promise<PagedResults> {
    const page = (metadata as { page?: number })?.page ?? 1
    const encoded = encodeURIComponent(query.title ?? '')
    const url = `${BASE_URL}/arama.html?icerik=${encoded}&sayfa=${page}`
    const request = createRequestObject({ url, method: 'GET' })
    const response = await this.requestManager.schedule(request, 1)
    const $ = this.cheerio.load(response.data)
    const tiles: MangaTile[] = []

    $('tr, .manga-item, .arama-sonuc').each((_: number, el: cheerio.Element) => {
      const link = $('a[href$=".html"]', el).first()
      const href = link.attr('href') || ''
      if (!href || href.includes('bolum') || href.includes('arama')) return
      const title = link.text().trim() || link.attr('title') || ''
      const cover = $('img', el).first().attr('src') || ''
      const id = href.replace('.html', '').split('/').pop() || ''
      if (title && id) {
        tiles.push(createMangaTile({ id, title: createIconText({ text: title }), image: cover.startsWith('http') ? cover : `${BASE_URL}${cover}` }))
      }
    })

    return createPagedResults({ results: tiles, metadata: tiles.length >= 20 ? { page: page + 1 } : undefined })
  }

  async getHomePageSections(sectionCallback: (section: HomeSection) => void): Promise<void> {
    const sections = [
      createHomeSection({ id: 'latest', title: 'Son Güncellenenler', type: HomeSectionType.singleRowNormal, view_more: true }),
      createHomeSection({ id: 'popular', title: 'Popüler Mangalar', type: HomeSectionType.singleRowNormal, view_more: true }),
    ]
    sections.forEach(s => sectionCallback(s))

    try {
      const req = createRequestObject({ url: `${BASE_URL}/?sayfa=1`, method: 'GET' })
      const res = await this.requestManager.schedule(req, 1)
      const $ = this.cheerio.load(res.data)
      sections[0].items = this.parseTiles($)
      sectionCallback(sections[0])
    } catch (e) { console.log('Latest error:', e) }

    try {
      const req = createRequestObject({ url: `${BASE_URL}/manga-list.html?listType=pagination`, method: 'GET' })
      const res = await this.requestManager.schedule(req, 1)
      const $ = this.cheerio.load(res.data)
      sections[1].items = this.parseTiles($)
      sectionCallback(sections[1])
    } catch (e) { console.log('Popular error:', e) }
  }

  async getViewMoreItems(homepageSectionId: string, metadata: unknown): Promise<PagedResults> {
    const page = (metadata as { page?: number })?.page ?? 1
    const url = homepageSectionId === 'latest' ? `${BASE_URL}/?sayfa=${page}` : `${BASE_URL}/manga-list.html?listType=pagination&sayfa=${page}`
    const request = createRequestObject({ url, method: 'GET' })
    const response = await this.requestManager.schedule(request, 1)
    const $ = this.cheerio.load(response.data)
    const tiles = this.parseTiles($)
    return createPagedResults({ results: tiles, metadata: tiles.length > 0 ? { page: page + 1 } : undefined })
  }

  private parseTiles($: cheerio.Root): MangaTile[] {
    const tiles: MangaTile[] = []
    const seen = new Set<string>()

    $('a[href$=".html"]').each((_: number, el: cheerio.Element) => {
      const href = $(el).attr('href') || ''
      if (!href || href.includes('bolum') || href.includes('index') || href.includes('arama') || href.includes('list')) return
      const title = $(el).attr('title') || $('img', el).attr('alt') || $(el).text().trim()
      const cover = $('img', el).attr('src') || ''
      const id = href.replace('.html', '').split('/').pop() || ''
      if (title && id && title.length > 2 && !seen.has(id)) {
        seen.add(id)
        tiles.push(createMangaTile({ id, title: createIconText({ text: title }), image: cover.startsWith('http') ? cover : cover ? `${BASE_URL}${cover}` : '' }))
      }
    })

    return tiles.slice(0, 40)
  }
}
