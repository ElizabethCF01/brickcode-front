/**
 * LDraw object packer
 *
 * Vendored from three.js (utils/packLDrawModel.mjs).
 * Source: https://github.com/mrdoob/three.js/blob/master/utils/packLDrawModel.mjs
 * License: MIT (three.js authors)
 *
 * Adaptation: the upstream script is a CLI (reads process.argv, writes a file
 * next to the input). We expose `packLDrawModel(ldrawPath, fileName)` returning
 * the packed string so the caller controls I/O. The packing algorithm is
 * preserved verbatim — only the entry point and module shape changed.
 *
 * See scripts/vendor/README.md for details.
 */

import fs from 'fs';
import path from 'path';

const MATERIALS_FILE_NAME = 'LDConfig.ldr';

/**
 * Pack an LDraw part/model file into a single self-contained .mpd string.
 *
 * @param {string} ldrawPath  Absolute path to the unzipped LDraw library root
 *                            (the dir containing LDConfig.ldr, parts/, p/).
 * @param {string} fileName   Path to the part/model relative to ldrawPath
 *                            (e.g. "parts/3001.dat").
 * @returns {string}          Packed .mpd content.
 * @throws  If LDConfig.ldr or the requested file (or any referenced subpart)
 *          cannot be located.
 */
export function packLDrawModel( ldrawPath, fileName ) {

	const materialsFilePath = path.join( ldrawPath, MATERIALS_FILE_NAME );
	const materialsContent = fs.readFileSync( materialsFilePath, { encoding: 'utf8' } );

	const objectsPaths = [];
	const objectsContents = [];
	const pathMap = {};
	const listOfNotFound = [];

	parseObject( fileName, true );

	let someNotFound = false;
	for ( let i = 0; i < listOfNotFound.length; i ++ ) {

		if ( ! pathMap[ listOfNotFound[ i ] ] ) {

			someNotFound = true;
			console.error( 'Error: File object not found: "' + listOfNotFound[ i ] + '".' );

		}

	}

	if ( someNotFound ) {

		throw new Error( 'packLDrawModel: some referenced files were not found in ' + ldrawPath );

	}

	let packedContent = materialsContent + '\n';
	for ( let i = objectsPaths.length - 1; i >= 0; i -- ) {

		packedContent += objectsContents[ i ];

	}

	packedContent += '\n';
	return packedContent;

	//

	function parseObject( fileName, isRoot ) {

		const originalFileName = fileName;

		let prefix = '';
		let objectContent = null;
		for ( let attempt = 0; attempt < 2; attempt ++ ) {

			prefix = '';

			if ( attempt === 1 ) {

				fileName = fileName.toLowerCase();

			}

			if ( fileName.startsWith( '48/' ) ) {

				prefix = 'p/';

			} else if ( fileName.startsWith( 's/' ) ) {

				prefix = 'parts/';

			}

			let absoluteObjectPath = path.join( ldrawPath, fileName );

			try {

				objectContent = fs.readFileSync( absoluteObjectPath, { encoding: 'utf8' } );
				break;

			} catch ( e ) { // eslint-disable-line no-unused-vars

				prefix = 'parts/';
				absoluteObjectPath = path.join( ldrawPath, prefix, fileName );

				try {

					objectContent = fs.readFileSync( absoluteObjectPath, { encoding: 'utf8' } );
					break;

				} catch ( e ) { // eslint-disable-line no-unused-vars

					prefix = 'p/';
					absoluteObjectPath = path.join( ldrawPath, prefix, fileName );

					try {

						objectContent = fs.readFileSync( absoluteObjectPath, { encoding: 'utf8' } );
						break;

					} catch ( e ) { // eslint-disable-line no-unused-vars

						try {

							prefix = 'models/';
							absoluteObjectPath = path.join( ldrawPath, prefix, fileName );

							objectContent = fs.readFileSync( absoluteObjectPath, { encoding: 'utf8' } );
							break;

						} catch ( e ) { // eslint-disable-line no-unused-vars

							if ( attempt === 1 ) {

								listOfNotFound.push( originalFileName );

							}

						}

					}

				}

			}

		}

		const objectPath = path.join( prefix, fileName ).trim().replace( /\\/g, '/' );

		if ( ! objectContent ) {

			return null;

		}

		if ( objectContent.indexOf( '\r\n' ) !== - 1 ) {

			objectContent = objectContent.replace( /\r\n/g, '\n' );

		}

		let processedObjectContent = isRoot ? '' : '0 FILE ' + objectPath + '\n';

		const lines = objectContent.split( '\n' );

		for ( let i = 0, n = lines.length; i < n; i ++ ) {

			let line = lines[ i ];
			let lineLength = line.length;

			let charIndex = 0;
			while ( ( line.charAt( charIndex ) === ' ' || line.charAt( charIndex ) === '\t' ) && charIndex < lineLength ) {

				charIndex ++;

			}

			line = line.substring( charIndex );
			lineLength = line.length;
			charIndex = 0;


			if ( line.startsWith( '0 FILE ' ) ) {

				if ( i === 0 ) {

					continue;

				}

				const subobjectFileName = line.substring( charIndex ).trim().replace( /\\/g, '/' );

				if ( subobjectFileName ) {

					const subobjectPath = pathMap[ subobjectFileName ];

					if ( ! subobjectPath ) {

						pathMap[ subobjectFileName ] = subobjectFileName;

					}

				}

			}

			if ( line.startsWith( '1 ' ) ) {

				charIndex = 2;

				for ( let token = 0; token < 13 && charIndex < lineLength; token ++ ) {

					while ( line.charAt( charIndex ) !== ' ' && line.charAt( charIndex ) !== '\t' && charIndex < lineLength ) {

						charIndex ++;

					}

					while ( ( line.charAt( charIndex ) === ' ' || line.charAt( charIndex ) === '\t' ) && charIndex < lineLength ) {

						charIndex ++;

					}

				}

				const subobjectFileName = line.substring( charIndex ).trim().replace( /\\/g, '/' );

				if ( subobjectFileName ) {

					let subobjectPath = pathMap[ subobjectFileName ];

					if ( ! subobjectPath ) {

						subobjectPath = parseObject( subobjectFileName );

					}

					pathMap[ subobjectFileName ] = subobjectPath ? subobjectPath : subobjectFileName;

					processedObjectContent += line.substring( 0, charIndex ) + pathMap[ subobjectFileName ] + '\n';

				}

			} else {

				processedObjectContent += line + '\n';

			}

		}

		if ( objectsPaths.indexOf( objectPath ) < 0 ) {

			objectsPaths.push( objectPath );
			objectsContents.push( processedObjectContent );

		}

		return objectPath;

	}

}
