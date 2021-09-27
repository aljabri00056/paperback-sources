import {
    Chapter,
    LanguageCode,
    Manga,
    MangaStatus,
    MangaTile,
    Tag,
    TagSection,
} from 'paperback-extensions-common'

import * as _ from "lodash"
// eslint-disable-next-line @typescript-eslint/no-var-requires
const CryptoJS = require('./external/crypto-js.min.js')

export class Parser {

    mangaSearchBody = {
        title: '',
        manga_types: {
            include: ['1', '2', '3', '4', '5', '6', '7', '8'],
            exclude: []
        },
        story_status: { include: [], exclude: [] },
        translation_status: { include: [], exclude: [3] },
        categories: { include: [null], exclude: [] },
        chapters: { min: '', max: '' },
        dates: { start: null, end: null },
        page: 1
    };

    storyStatus: { [key: string]: string } = {
        '2': "مستمرة",
        '3': "منتهية"
    }

    translationStatus: { [key: string]: string } = {
        '0': "منتهية",
        '1': "مستمرة",
        '2': "متوقفة",
        '3': "غير مترجمة"
    }

    decryptResponse(t: string) {
        var e = t.split("|")
            , n = e[0]
            , r = e[2]
            , o = e[3]
            , i = CryptoJS.SHA256(o).toString()
            , a = CryptoJS.AES.decrypt({
                ciphertext: CryptoJS.enc.Base64.parse(n)
            }, CryptoJS.enc.Hex.parse(i), {
                iv: CryptoJS.enc.Base64.parse(r)
            });
        return JSON.parse(CryptoJS.enc.Utf8.stringify(a));
    }

    pack(data: any): any {
        let results, result, value, root

        results = []

        for (const t in data['rows']) {

            if (data['rows'][t].hasOwnProperty('rows')) {
                root = true
                results.push(this.pack(data['rows'][t]))

            } else {
                value = data['rows'][t]
                result = _.zipObject(data['cols'], value)
                result = _.isEmpty(result) ? undefined : result
                results.push(result)
            }
        }

        return (root ? _.zipObject(data['cols'], results) : results)
    }

    getTitles(data: any): any {

        let titles: string[] = []

        for (let key of ["title", "synonyms", "arabic_title", "english", "japanese"]) {

            let title = data[key].trim()

            if (typeof title === 'undefined' || titles.includes(title)) continue

            titles.push(title)
        }

        return titles

    }

    parseMangaDetails(mangaId: string, data: any, domain: string): Manga {

        const mangaDetails = data.mangaData

        const status = mangaDetails.story_status == 2 ? MangaStatus.ONGOING : MangaStatus.COMPLETED

        const tags: Tag[] = []

        for (const tag of mangaDetails.categories) {
            tags.push(createTag({
                id: tag.id.toString(),
                label: tag.name
            }))
        }

        const MangaType = [createTag({
            id: mangaDetails?.type?.id.toString(),
            label: [mangaDetails?.type?.title, mangaDetails?.type?.name].join(' ')
        })]

        const TranslationStatus = [createTag({
            id: mangaDetails.translation_status.toString(),
            label: this.translationStatus[mangaDetails.translation_status.toString()] ?? ''
        })]


        const tagSections: TagSection[] = [
            createTagSection({ id: 'Category', label: 'التصنيف', tags: tags }),
            createTagSection({ id: 'MangaType', label: 'الأصل', tags: MangaType }),
            createTagSection({ id: 'TranslationStatus', label: 'حالة الترجمة', tags: TranslationStatus })
        ]

        return createManga({
            id: mangaId,
            image: `https://media.${domain}/uploads/manga/cover/${mangaId}/${mangaDetails.cover}`,
            rating: mangaDetails.rating,
            status: status,
            titles: this.getTitles(mangaDetails),
            artist: mangaDetails?.['authors']?.[0]?.['name'],
            author: mangaDetails?.['artists']?.[0]?.['name'],
            desc: mangaDetails.summary,
            follows: data.mangaLibrary.reading,
            tags: tagSections
        })

    }

    parseChapters(mangaId: string, data: any): Chapter[] {
        const chapters: Chapter[] = []

        data = data['iv'] ? this.decryptResponse(data.data) : data;
        data = data['isCompact'] ? this.pack(data) : data;

        data.releases.map((chapter: any) => {
            const team = data.teams.find((t: any) => t.id === chapter.team_id);
            const chapterization = data.chapterizations.find((c: any) => c.id === chapter.chapterization_id);
            chapters.push(createChapter({
                id: encodeURIComponent([mangaId, 'manga-slug', chapterization.chapter, team.name].join('/')),
                mangaId: mangaId,
                volume: Number.isNaN(chapterization.volume) ? 0 : chapterization.volume,
                chapNum: Number(chapterization.chapter),
                group: team.name ?? '',
                langCode: LanguageCode.SANSKRIT,
                name: chapterization.title,
                time: new Date(chapterization.time_stamp * 1000)
            }))
        });

        console.log(`parseChapters: ${chapters.length} Chapter`)

        return chapters
    }

    parseChapterDetails($: any): string[] {
        const pages: string[] = []

        let data = $(".js-react-on-rails-component").html()
        data = JSON.parse(data)

        let url = (data.globals.wla.configs.http_media_server || data.globals.wla.configs.media_server) + '/uploads/releases/';

        data = data.readerDataAction.readerData.release;
        let images = [];

        if (data.pages && data.pages.length > 0) {
            images = data.pages.map((page: any) => '/hq/' + page);
        } else {
            images = data.webp_pages.map((page: any) => '/hq_webp/' + page);
        }

        images.map((image: any) => { pages.push(`${url}${data.storage_key + image}`) })

        return pages

    }

    parseSearchResults(data: any, domain: string): MangaTile[] {
        const mangaTiles: MangaTile[] = []

        data = data['iv'] ? this.decryptResponse(data.data) : data;
        data = data.mangas || [];

        data.map((manga: any) => {
            mangaTiles.push(createMangaTile({
                id: JSON.stringify(manga.id),
                title: createIconText({ text: manga.title }),
                image: `https://media.${domain}/uploads/manga/cover/${manga.id}/${manga.cover}`
            }))
        })

        return mangaTiles

    }

    parseSearchTags($: any): TagSection[] {

        const tagSections: TagSection[] = [
            createTagSection({ id: 'mangaTypes', label: 'الأصل', tags: [] }),
            createTagSection({ id: 'storyStatus', label: 'حالة القصة', tags: [] }),
            createTagSection({ id: 'translationStatus', label: 'حالة الترجمة', tags: [] })
        ]

        const data = JSON.parse($(".js-react-on-rails-component").html())

        const mangaTypes = data.mangaTypes
        tagSections[0]!.tags = mangaTypes.map((tag: any) => createTag({ id: `mangaTypes_${tag.id}`, label: tag.name }))

        tagSections[1]!.tags = Object.keys(this.storyStatus).map((tag: any) => createTag({
            id: `storyStatus_${tag}`, label: this.storyStatus[tag]!
        }))

        tagSections[2]!.tags = Object.keys(this.translationStatus).map((tag: any) => createTag({
            id: `translationStatus_${tag}`, label: this.translationStatus[tag]!
        }))


        for (const tag of data.categoryTypes) {
            const group = tag.name

            tagSections.push(createTagSection({
                id: group,
                label: group,
                tags: tag.categories.map((tag: any) =>
                    createTag({ id: `categoryTypes_${tag.id}`, label: tag.name })
                )
            }))
        }

        return tagSections
    }

    parseFilterUpdatedManga(data: any, time: Date, ids: string[]) {
        const foundIds: string[] = []
        let passedReferenceTime = false

        data = data['iv'] ? this.decryptResponse(data.data) : data;
        data = data.rows.rows || [];

        for (const item of data) {
            const id = item[1]
            const mangaTime = new Date(item[3] * 1000)
            passedReferenceTime = mangaTime <= time
            if (!passedReferenceTime) {
                if (ids.includes(id)) {
                    foundIds.push(id)
                }
            } else break
        }

        if (!passedReferenceTime) {
            return { updates: foundIds, loadNextPage: true }
        } else {
            return { updates: foundIds, loadNextPage: false }
        }

    }
}
