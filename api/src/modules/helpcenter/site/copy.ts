/** The words a help center's site prints around its own content, in English. */
const en = {
  home: 'Home',
  knowledgeBase: 'Knowledge base',
  forms: 'Forms',
  search: 'Search',
  searchPlaceholder: 'Search articles',
  searchFor: (term: string) => `Results for “${term}”`,
  noResults: 'No articles match. Try other words.',
  categories: 'Browse by topic',
  popular: 'Popular articles',
  recent: 'Recently updated',
  articles: (count: number) => (count === 1 ? '1 article' : `${count} articles`),
  views: (count: number) => (count === 1 ? '1 view' : `${count} views`),
  moreIn: (title: string) => `More in ${title}`,
  attachments: 'Attachments',
  empty: 'Nothing here yet.',
  notFound: 'This page does not exist.',
  backHome: 'Back to the help center',
  fillIn: 'Fill in a form',
  skip: 'Skip to content',
};

type Copy = typeof en;

const mn: Copy = {
  home: 'Нүүр',
  knowledgeBase: 'Мэдлэгийн сан',
  forms: 'Маягт',
  search: 'Хайх',
  searchPlaceholder: 'Нийтлэл хайх',
  searchFor: (term) => `“${term}” хайлтын үр дүн`,
  noResults: 'Тохирох нийтлэл олдсонгүй. Өөр үгээр хайна уу.',
  categories: 'Сэдвээр үзэх',
  popular: 'Их уншсан нийтлэл',
  recent: 'Сүүлд шинэчлэгдсэн',
  articles: (count) => `${count} нийтлэл`,
  views: (count) => `${count} үзсэн`,
  moreIn: (title) => `${title} ангиллын бусад`,
  attachments: 'Хавсралт',
  empty: 'Одоохондоо хоосон байна.',
  notFound: 'Энэ хуудас байхгүй байна.',
  backHome: 'Тусламжийн төв рүү буцах',
  fillIn: 'Маягт бөглөх',
  skip: 'Агуулга руу шилжих',
};

/** The site's words in the help center's language: Mongolian for `mn`, English otherwise. */
export const copyOf = (language: string) => (language === 'mn' ? mn : en);

export type { Copy };
