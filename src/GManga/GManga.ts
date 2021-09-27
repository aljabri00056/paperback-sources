import {
    Chapter,
    ChapterDetails,
    ContentRating,
    Manga,
    PagedResults,
    SearchRequest,
    Source,
    SourceInfo,
    LanguageCode,
    TagType,
    MangaUpdates,
    Request,
    Section,
    TagSection,
} from 'paperback-extensions-common'

import { Parser } from './GMangaParser'

import {
    getDomain,
    BackupDomain,
    domainSettings,
    resetSettings
} from './GMangaSettings'

const GMANGA_DOMAIN = 'gmanga.me'
const GMANGA_BaseUrl = `https://${GMANGA_DOMAIN}`
const Backup_DOMAIN = 'api2.gmanga.me'

export const GMangaInfo: SourceInfo = {
    author: 'aljabri00056',
    description: 'Extension that pulls manga from GManga',
    icon: 'icon.png',
    name: 'GManga',
    version: '2.4.0',
    authorWebsite: 'https://github.com/aljabri00056',
    websiteBaseURL: GMANGA_BaseUrl,
    contentRating: ContentRating.EVERYONE,
    language: LanguageCode.SANSKRIT,
    sourceTags: [
        {
            text: 'Arabic',
            type: TagType.BLUE,
        },

        {
            text: 'Cloudflare',
            type: TagType.RED
        }
    ],
}


export class GManga extends Source {

    GMANGA_DOMAIN = GMANGA_DOMAIN
    GMANGA_BaseUrl = GMANGA_BaseUrl
    Backup_DOMAIN = Backup_DOMAIN

    parser = new Parser()

    requestManager = createRequestManager({
        requestsPerSecond: 4,
        requestTimeout: 15000,
    })

    stateManager = createSourceStateManager({ 'default_domain': this.GMANGA_DOMAIN })

    override async getSourceMenu(): Promise<Section> {
        return Promise.resolve(
            createSection({
                id: 'main',
                header: 'Source Settings',
                rows: () =>
                    Promise.resolve([
                        domainSettings(this.stateManager),
                        resetSettings(this.stateManager)
                    ])
            })
        )
    }

    override getMangaShareUrl(mangaId: string): string {
        return `${this.GMANGA_BaseUrl}/mangas/${mangaId}`
    }

    async getMangaDetails(mangaId: string): Promise<Manga> {

        const domain = await getDomain(this.stateManager)
        const backupDomain = await BackupDomain(this.stateManager)
        const url = `https://${backupDomain ? this.Backup_DOMAIN : domain}/api/mangas/${mangaId}`

        const request = createRequestObject({
            url: url,
            method: 'GET'
        })

        console.log(`getMangaDetails: ${mangaId}`)
        console.log(`getMangaDetails: BackupDomain: ${backupDomain}`)
        console.log(`getMangaDetails: ${url}`)

        const response = await this.requestManager.schedule(request, 1)

        const data = JSON.parse(response.data)

        return this.parser.parseMangaDetails(mangaId, data, domain)

    }

    async getChapters(mangaId: string): Promise<Chapter[]> {

        const domain = await getDomain(this.stateManager)
        const backupDomain = await BackupDomain(this.stateManager)
        const url = `https://${backupDomain ? this.Backup_DOMAIN : domain}/api/mangas/${mangaId}/releases`

        const pageRequest = createRequestObject({
            url: url,
            method: 'GET'
        })

        console.log(`getChapters: ${mangaId}`)
        console.log(`getChapters: BackupDomain: ${backupDomain}`)
        console.log(`getChapters: ${url}`)

        const response = await this.requestManager.schedule(pageRequest, 1)
        const data = JSON.parse(response.data)

        return this.parser.parseChapters(mangaId, data)

    }

    async getChapterDetails(mangaId: string, chapterId: string): Promise<ChapterDetails> {

        const domain = await getDomain(this.stateManager)
        const url = `https://${domain}/mangas/${chapterId}`

        const pageRequest = createRequestObject({
            url: url,
            method: 'GET'
        })

        console.log(`getChapterDetails: ${mangaId} - ${chapterId}`)
        console.log(`getChapterDetails: ${url}`)

        const response = await this.requestManager.schedule(pageRequest, 1)

        let $ = this.cheerio.load(response.data)

        const pages: string[] = this.parser.parseChapterDetails($)

        console.log(...pages)

        return createChapterDetails({
            id: chapterId,
            mangaId: mangaId,
            pages: pages,
            longStrip: false
        })

    }

    async getSearchResults(query: SearchRequest, metadata: any): Promise<PagedResults> {

        const page: number = metadata?.page ?? 1

        const domain = await getDomain(this.stateManager)
        const url = `https://${domain}/api/mangas/search`

        this.parser.mangaSearchBody.title = query.title ?? ''
        this.parser.mangaSearchBody.page = page

        const request = createRequestObject({
            url: url,
            method: 'POST',
            data: JSON.stringify(this.parser.mangaSearchBody),
            headers: {
                'content-type': 'application/json'
            }
        })

        console.log(`getSearchResults: ${query.title}`)

        const response = await this.requestManager.schedule(request, 1)

        const mangas = this.parser.parseSearchResults(JSON.parse(response.data), domain)

        console.log(`getSearchResults: ${mangas.length} results`)

        return createPagedResults({
            results: mangas,
            metadata: mangas.length > 0 ? { page: (page + 1) } : undefined
        })

    }

    override async getSearchTags(): Promise<TagSection[]> {
        const domain = await getDomain(this.stateManager)
        const url = `https://${domain}/mangas/`

        const request = createRequestObject({
            url: url,
            method: 'GET'
        })

        const response = await this.requestManager.schedule(request, 1)
        const $ = this.cheerio.load(response.data)

        return this.parser.parseSearchTags($)
    }

    override async supportsTagExclusion(): Promise<boolean> {
        return true
    }


    override async filterUpdatedManga(mangaUpdatesFoundCallback: (updates: MangaUpdates) => void, time: Date, ids: string[]): Promise<void> {

        let loadNextPage = true
        let currPageNum = 1

        while (loadNextPage) {

            const domain = await getDomain(this.stateManager)
            const url = `https://${domain}/api/releases?page=${currPageNum}`

            const request = createRequestObject({
                url: url,
                method: 'GET'
            })

            const response = await this.requestManager.schedule(request, 1)
            const data = JSON.parse(response.data)

            const updatedManga = this.parser.filterUpdatedManga(data, time, ids)
            loadNextPage = updatedManga.loadNextPage
            if (loadNextPage) {
                currPageNum++
            }
            if (updatedManga.updates.length > 0) {
                mangaUpdatesFoundCallback(createMangaUpdates({
                    ids: updatedManga.updates
                }))
            }
        }


    }

    override getCloudflareBypassRequest(): Request {
        return createRequestObject({
            url: `${this.GMANGA_BaseUrl}`,
            method: 'GET',
        })
    }

}