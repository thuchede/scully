import {cpus} from 'os';
import {launchedBrowser} from '../renderPlugins/launchedBrowser';
import {routeContentRenderer} from '../renderPlugins/routeContentRenderer';
import {addOptionalRoutes, HandledRoute} from '../routerPlugins/addOptionalRoutesPlugin';
import {traverseAppRoutes} from '../routerPlugins/traverseAppRoutesPlugin';
import {storeRoutes} from '../systemPlugins/storeRoutes';
import {writeToFs} from '../systemPlugins/writeToFs.plugin';
import {asyncPool} from './asyncPool';
import {chunk} from './chunk';
import {loadConfig, updateScullyConfig} from './config';
import {ScullyConfig} from './interfacesandenums';
import {log, logWarn} from './log';

export const generateAll = async (config?: Partial<ScullyConfig>) => {
  if (config) {
    await updateScullyConfig(config);
  }
  await loadConfig;
  try {
    log('Finding all routes in application.');
    const unhandledRoutes = await traverseAppRoutes();

    if (unhandledRoutes.length < 1) {
      logWarn('No routes found in application, are you sure you installed the router? Terminating.');
      process.exit(15);
    }

    log('Pull in data to create additional routes.');
    const handledRoutes = await addOptionalRoutes(unhandledRoutes);
    // await storeRoutes(handledRoutes);
    /** launch the browser, its shared among renderers */
    const browser = await launchedBrowser();
    /** start handling each route, works in chunked parallel mode  */
    // await doChunks(handledRoutes);
    await renderParallel(handledRoutes);
    /** save router to static json thingy */
    await storeRoutes(handledRoutes);
    return handledRoutes;
  } catch (e) {
    // TODO: add better error handling
    log(e);
  }
  return [];
};

async function renderParallel(dataRoutes) {
  const renderRoute = route =>
    routeContentRenderer(route).then((html: string) => writeToFs(route.route, html));
  return asyncPool(cpus().length, dataRoutes, renderRoute);
}

async function doChunks(dataRoutes) {
  const chunked = chunk(dataRoutes, cpus().length);

  return chunked.reduce(async (acc, part) => {
    const x = await acc;
    const activeChunk = await Promise.all(
      part.map(async (handledRoute: HandledRoute) =>
        routeContentRenderer(handledRoute).then((html: string) => writeToFs(handledRoute.route, html))
      )
    );
    return x.concat(activeChunk);
  }, Promise.resolve([]));
}
