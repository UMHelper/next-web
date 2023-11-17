import { defineDocumentType, makeSource } from 'contentlayer/source-files';

import rehypePrettyCode, {
  type Options as PrettyCodeOptions,
} from 'rehype-pretty-code';
import rehypeSlug from 'rehype-slug';
import rehypePrismPlus from 'rehype-prism-plus';
import remarkGfm from 'remark-gfm';
 
// defining document type where we will defing our mdx document frontmatter structure
// (all these fields will be passed to static json with types that can be imported and used by next app)
export const Post = defineDocumentType(() => ({
  name: 'Post',
  filePathPattern: `**/*.mdx`,
  contentType: 'mdx',
  fields: {
    title: { type: 'string', required: true },
    date: { type: 'date', required: true },
    tags: {
      type: 'list',
      of: { type: 'string' },
      required: true,
    },
    authors: {
      type: 'list', 
      of: { type: 'string' },
      required: true,
    }
  },
  computedFields: {
    url: {
      type: 'string',
      resolve: (post) => `${post._raw.flattenedPath}`,
    },
    readTime: {
      type: 'string',
      resolve: (post) => {
        const wordsPerMinute = 200;
        const noOfWords = post.body.raw.split(/\s/g).length;
        const minutes = noOfWords / wordsPerMinute;
        const readTime = Math.ceil(minutes);
        return readTime;
      },
    },
  },
}));
 
export default makeSource({
  // folder in which we will store our content mdx files
  contentDirPath: 'blog',
  documentTypes: [Post],
  mdx: {
    rehypePlugins: [
      /**
       * Adds ids to headings
       */
      rehypeSlug,
      [
        /**
         * Enhances code blocks with syntax highlighting, line numbers,
         * titles, and allows highlighting specific lines and words
         */
        rehypePrettyCode,
        {
          theme: {
            // light: 'github-light',
            dark: 'github-dark',
          },
        } satisfies Partial<PrettyCodeOptions>,
      ],
      [rehypePrismPlus, { ignoreMissing: true }]
    ],
    // remarkPlugins: [remarkGfm],
  },
});
