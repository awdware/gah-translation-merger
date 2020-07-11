import path from 'path';

import { GahPlugin, GahPluginConfig } from '@awdware/gah-shared';

import { TranslationManagerConfig } from './translation-manager-config';
import { TranslationCollection } from './translation-collection';

export class TranslationMerger extends GahPlugin {
  constructor() {
    super('TranslationMerger');
  }

  public async onInstall(existingCfg: TranslationManagerConfig): Promise<GahPluginConfig> {
    const newCfg = new TranslationManagerConfig();

    newCfg.searchGlobPattern = await this.promptService.input({
      msg: 'Please enter a globbing path to the json translation files',
      default: 'src/assets/**/translations/*.json',
      enabled: () => !(existingCfg?.searchGlobPattern),
      validator: (val: string) => val.endsWith('.json')
    }) ?? existingCfg.searchGlobPattern;
    newCfg.destinationPath = await this.promptService.input({
      msg: 'Please enter the destination path for the merged translation files',
      default: 'src/assets/i18n',
      enabled: () => !(existingCfg?.destinationPath),
    }) ?? existingCfg.destinationPath;
    // .*\.(\w+)\.json
    newCfg.matchPattern = await this.promptService.input({
      msg: 'Please enter a regex that has one matching group that matches the locale of the filename. leave empty for matching the whole filename'
        + ' Example: ".*\\.(\\w+)\\.json" anything that is a word character before the .json path has to match',
      default: '',
      enabled: () => !(existingCfg?.matchPattern),
    }) ?? existingCfg.matchPattern;

    return newCfg;
  }

  public onInit() {
    this.registerEventListener('ASSETS_BASE_STYLES_COPIED', (event) => {
      const name = event.module?.isHost ? this.fileSystemService.directoryName(event.module.basePath) : event.module?.moduleName;

      this.loggerService.log('Merging translation files for ' + name);

      const cfg = this.config as TranslationManagerConfig;
      if (!cfg)
        throw new Error('Plugin settings have not been provided.');

      if (!cfg.searchGlobPattern)
        throw new Error('Missing Setting: searchGlobPattern');
      if (!cfg.destinationPath)
        throw new Error('Missing Setting: destinationPath');

      const allTranslationFiles = this.fileSystemService.getFilesFromGlob('.gah/' + cfg.searchGlobPattern, ['node_modules'], true);

      this.loggerService.debug('Found translation files:' + allTranslationFiles.join(', '));

      const translationCollection = new Array<TranslationCollection>();

      allTranslationFiles.forEach(x => {
        let locale: string;
        if (cfg.matchPattern) {
          const localeRegex = new RegExp(cfg.matchPattern);
          const match = path.basename(x).match(localeRegex);
          if (!match || !(match?.[1])) {
            throw new Error('The locale matcher did not fine the locale in the filename: ' + path.basename(x));
          }
          locale = match[1];
        } else {
          locale = path.basename(x).replace(/\.json$/, '');
        }

        this.loggerService.debug(`Found locale: "${locale}" for: "${x}"`);

        const content = this.fileSystemService.readFile(x);
        let trans = translationCollection.find(x => x.locale === locale);
        if (!trans) {
          trans = new TranslationCollection();
          trans.locale = locale;
          translationCollection.push(trans);
        }
        const parsedContent = JSON.parse(content);
        trans.translations = { ...trans.translations, ...parsedContent };
      });

      this.fileSystemService.ensureDirectory(path.join('.gah', cfg.destinationPath));

      translationCollection.forEach(x => {
        const filePath = path.join('.gah', cfg.destinationPath, `${x.locale}.json`);
        this.fileSystemService.saveObjectToFile(filePath, x.translations, true);
      });
      this.loggerService.success('Translation files merged successfully!');
    });
  }
}
