import {
    Chapter,
    HomeSection,
    HomeSectionType,
    LanguageCode,
    Manga,
    MangaStatus,
    MangaTile,
    SearchRequest,
    Tag,
    TagSection,
} from 'paperback-extensions-common'

import * as _ from "lodash"
// eslint-disable-next-line @typescript-eslint/no-var-requires
const CryptoJS = require('./external/crypto-js.min.js')

export class Parser {


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

    cleanObject = (object: object) => {
        Object
            .entries(object)
            .forEach(([k, v]) => {
                if (v && typeof v === 'object')
                    this.cleanObject(v);
                if (v &&
                    typeof v === 'object' &&
                    !Object.keys(v).length ||
                    v === null ||
                    v === undefined ||
                    // @ts-ignore
                    v.length === 0
                ) {
                    if (Array.isArray(object))
                        // @ts-ignore
                        object.splice(k, 1);
                    else if (!(v instanceof Date))
                        // @ts-ignore
                        delete object[k];
                }
            });
        return object;
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
            follows: data.mangaLibrary?.reading,
            tags: tagSections
        })

    }

    parseChapters(mangaId: string, data: any): Chapter[] {
        const chapters: Chapter[] = []

        data = data['iv'] ? this.decryptResponse(data.data) : data;
        data = data['isCompact'] ? this.pack(data) : data;
        // delete empty keys
        data = this.cleanObject(data);

        data.releases?.map((chapter: any) => {
            const team = data.teams.find((t: any) => t.id === chapter.team_id);
            const chapterization = data.chapterizations.find((c: any) => c.id === chapter.chapterization_id);
            chapters.push(createChapter({
                id: encodeURIComponent([mangaId, 'manga-slug', chapterization.chapter, team.name].join('/')),
                mangaId: mangaId,
                // volume: Number.isNaN(chapterization.volume) ? 0 : chapterization.volume,
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

        images.map((image: any) => { pages.push(encodeURI(`${url}${data.storage_key + image}`)) })

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

    searchBody(query: SearchRequest, page: number): string {

        const manga_types = query.includedTags
            ?.filter(type => type.id.includes('mangaTypes_'))
            .map(type => type.id.replace('mangaTypes_', ''))

        const excludedManga_types = query.excludedTags
            ?.filter(type => type.id.includes('mangaTypes_'))
            .map(type => type.id.replace('mangaTypes_', ''))


        const story_status = query.includedTags
            ?.filter(tag => tag.id.includes('storyStatus_'))
            .map(tag => tag.id.replace('storyStatus_', ''))

        const excludedStory_status = query.excludedTags
            ?.filter(tag => tag.id.includes('storyStatus_'))
            .map(tag => tag.id.replace('storyStatus_', ''))


        const translation_status = query.includedTags
            ?.filter(tag => tag.id.includes('translationStatus_'))
            .map(tag => tag.id.replace('translationStatus_', ''))

        const excludedTranslation_status = query.excludedTags
            ?.filter(tag => tag.id.includes('translationStatus_'))
            .map(tag => tag.id.replace('translationStatus_', ''))


        const categories = query.includedTags
            ?.filter(tag => tag.id.includes('categoryTypes_'))
            .map(tag => tag.id.replace('categoryTypes_', ''))

        const excludedCategories = query.excludedTags
            ?.filter(tag => tag.id.includes('categoryTypes_'))
            .map(tag => tag.id.replace('categoryTypes_', ''))



        return JSON.stringify({
            "title": query.title ?? '',
            "manga_types": { "include": manga_types, "exclude": excludedManga_types },
            "oneshot": null,
            "story_status": { "include": story_status, "exclude": excludedStory_status },
            "translation_status": { "include": translation_status, "exclude": excludedTranslation_status },
            "categories": { "include": categories, "exclude": excludedCategories },
            "chapters": { "min": "", "max": "" },
            "dates": { "start": null, "end": null },
            "page": page
        })
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

    parseHomeSections($: any, sectionCallback: (section: HomeSection) => void): void {

        let data = $(".js-react-on-rails-component").html()
        data = JSON.parse(data)

        let server = data.globals.wla.configs.media_server.replace('//media.', '')

        const hotSection = createHomeSection({ id: 'hotMangas', title: 'المانجات الرائجة', type: HomeSectionType.featured })
        const finishedSection = createHomeSection({ id: 'finishedMangas', title: 'مانجات اكتملت ترجمتها آخر ٧ أيام' })
        const recommendedSection = createHomeSection({
            id: 'recommended',
            title: data.collectionDataAction.collection.title.trim() ?? 'Recommendations'
        })

        const hot = { mangas: data.hotMangasAction.hotMangas }
        const finished = { mangas: data.mangaDataAction.finishedMangas }
        const recommended = { mangas: data.collectionDataAction.collection.mangas }

        const sections = [hotSection, finishedSection, recommendedSection]
        const sectionData = [hot, finished, recommended]

        for (const [i, section] of sections.entries()) {
            sectionCallback(section)
            const manga: MangaTile[] = this.parseSearchResults(sectionData[i], server)
            section.items = manga
            sectionCallback(section)
        }


    }

    parseFilterUpdatedManga(data: any, time: Date, ids: string[]) {
        const foundIds: string[] = []
        let passedReferenceTime = false

        data = data['iv'] ? this.decryptResponse(data.data) : data;
        data = data.rows[0].rows || [];

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
