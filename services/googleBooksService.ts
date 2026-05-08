export interface GoogleBook {
  id: string;
  title: string;
  authors: string[];
  description: string;
  coverImage: string;
  pageCount: number;
  categories: string[];
  averageRating?: number;
  previewLink?: string;
  price?: number;
  buyLink?: string;
  epubLink?: string;
  pdfLink?: string;
}

export const searchGoogleBooks = async (query: string): Promise<GoogleBook[]> => {
  if (!query) query = "subject:fiction"; // default query
  try {
    const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=40`);
    const data = await res.json();
    if (!data.items) return [];
    
    return data.items.map((item: any) => {
      const vol = item.volumeInfo;
      const sale = item.saleInfo;
      const access = item.accessInfo;
      return {
        id: item.id,
        title: vol.title || 'Unknown Title',
        authors: vol.authors || ['Unknown Author'],
        description: vol.description || '',
        coverImage: vol.imageLinks?.thumbnail?.replace('http:', 'https:') || null,
        pageCount: vol.pageCount || 0,
        categories: vol.categories || [],
        averageRating: vol.averageRating,
        previewLink: vol.previewLink,
        price: sale?.listPrice?.amount || undefined,
        buyLink: sale?.buyLink,
        epubLink: access?.epub?.downloadLink || access?.epub?.acsTokenLink,
        pdfLink: access?.pdf?.downloadLink || access?.pdf?.acsTokenLink,
      };
    });
  } catch (e) {
    console.error("Google books error", e);
    return [];
  }
};
