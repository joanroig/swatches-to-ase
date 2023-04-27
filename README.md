# Swatches to ASE

Convert Procreate Swatches files to ASE format (Adobe Swatch Exchange).

Can be used for importing Procreate palettes into Photoshop or other compatible programs like Illustrator or Affinity Designer.

## Example

Go to the `examples` folder to see some converted palettes like this one:

<p align="center">
  <img src="examples/source.png" alt="source palette" width="300px"/>
  <br>
  <i>Source palette</i>
</p>

<p align="center">
  <img src="examples/ps.png" alt="converted palette" width="300px"/>
  <br>
  <i>Converted palette imported in Photoshop</i>
</p>

## How to use

Be sure to have [Node.js](https://nodejs.org/en/download/) installed, then:

- [Download](https://github.com/joanroig/swatches-to-ase/archive/refs/heads/main.zip) or clone the repo.
- Run `npm install` in the root folder to install dependencies.
- Add your swatches files in the `palette-import` folder.
- Run `npm run convert` to convert the palettes.
- The converted files should be in the `palette-export` folder.

## Configuration

The input, output, color naming and addition of black & white colors can be changed in: [config.json](config.json)

### Configuration parameters

- **inFolder:** folder used to read the swatches.
- **outFolder:** folder used to output the resulting ase files.
- **colorNameFormat:** sets the collection of color names to be used. Available namings are: _roygbiv, basic, html, x11, pantone, ntc_. See [color namer](https://github.com/colorjs/color-namer) for reference.
- **addBlackWhite:** if true, two extra colors will be added:

<p align="center">
  <img src="examples/ps-bw.png" alt="converted palette" width="300px"/>
  <br>
  <i>Converted palette with extra black and white colors imported in Photoshop</i>
</p>

## Credits

Source of the provided palettes:

https://bardotbrush.com/procreate-color-palettes/

### Libraries used

- https://github.com/szydlovski/procreate-swatches
- https://www.npmjs.com/package/color-convert
- https://github.com/DominikGuzei/node-ase-utils
- https://github.com/colorjs/color-namer
