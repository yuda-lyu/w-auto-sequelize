import rollupFiles from 'w-package-tools/src/rollupFiles.mjs'


let fdSrc = './src'
let fdTar = './dist'


rollupFiles({
    fns: 'WAutoSequelize.mjs',
    fdSrc,
    fdTar,
    nameDistType: 'kebabCase',
    globals: {
        'sequelize': 'sequelize',
        'async': 'async',
        'fs': 'fs',
        'path': 'path',
        'eslint': 'eslint',
    },
    external: [
        'sequelize',
        'async',
        'fs',
        'path',
        'eslint',
    ],
})

