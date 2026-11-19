const { HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Opens a file picker to change the image of the sheet's document.
 * Triggered by elements with data-action="editImage".
 */
async function onEditImage(event, target) {
    const attr = target.dataset.edit ?? 'img';
    const current = foundry.utils.getProperty(this.document._source, attr);
    const picker = new foundry.applications.apps.FilePicker.implementation({
        type: 'image',
        current,
        callback: (path) => this.document.update({ [attr]: path }),
    });
    await picker.render({ force: true });
}

/**
 * Shared behaviour for all Dark Heresy ApplicationV2 document sheets:
 *  - single handlebars part (the legacy templates)
 *  - simple tab handling for the `.dh-navigation` / `.tab` markup
 *  - conversion of `data-dtype` form fields
 *  - a jQuery based `_activateListeners(html)` hook that replaces the V1 `activateListeners`
 *
 * @param Base {typeof foundry.applications.sheets.ActorSheetV2 | typeof foundry.applications.sheets.ItemSheetV2}
 */
export function DHSheetMixin(Base) {
    return class DHSheet extends HandlebarsApplicationMixin(Base) {
        static DEFAULT_OPTIONS = {
            classes: ['dark-heresy-2nd', 'dh-sheet'],
            form: { submitOnChange: true, closeOnSubmit: false },
            window: { resizable: true },
            actions: { editImage: onEditImage },
        };

        /** The tab that is shown when the sheet is opened */
        static DEFAULT_TAB = 'main';

        async _prepareContext(options) {
            const context = await super._prepareContext(options);
            context.dh = CONFIG.dh;
            context.editable = this.isEditable;
            context.owner = this.document.isOwner;
            context.limited = this.document.limited;
            context.system = this.document.system;
            context.flags = this.document.flags;
            context.effects = this.document.effects.contents;
            return context;
        }

        async _onRender(context, options) {
            await super._onRender(context, options);
            this._activateTabs();
            if (!this.isEditable) {
                this.element.querySelectorAll('input, select, textarea').forEach((el) => (el.disabled = true));
            }
            this._activateListeners($(this.element));
        }

        /**
         * Override to bind listeners. Called after every render with the sheet element as jQuery object.
         * @param html {jQuery}
         */
        _activateListeners(html) {}

        _activateTabs() {
            const navLinks = [...this.element.querySelectorAll('.dh-navigation a[data-tab]')];
            const tabs = [...this.element.querySelectorAll('.tab[data-tab]')];
            if (!navLinks.length || !tabs.length) return;

            const show = (name) => {
                if (!tabs.some((t) => t.dataset.tab === name)) name = tabs[0].dataset.tab;
                this._activeTab = name;
                navLinks.forEach((a) => a.classList.toggle('active', a.dataset.tab === name));
                tabs.forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
            };
            navLinks.forEach((a) =>
                a.addEventListener('click', (ev) => {
                    ev.preventDefault();
                    show(a.dataset.tab);
                }),
            );
            show(this._activeTab ?? this.constructor.DEFAULT_TAB);
        }

        _processFormData(event, form, formData) {
            applyDataTypes(form, formData);
            return super._processFormData(event, form, formData);
        }
    };
}

/**
 * Applies the legacy `data-dtype` attribute (Number / Boolean) to the submitted form data.
 * @param form {HTMLFormElement}
 * @param formData {FormDataExtended}
 */
export function applyDataTypes(form, formData) {
    for (const el of form.querySelectorAll('[data-dtype]')) {
        const name = el.name;
        if (!name || !(name in formData.object)) continue;
        const value = formData.object[name];
        switch (el.dataset.dtype) {
            case 'Number':
                formData.object[name] = value === '' || value === null ? null : Number(value);
                break;
            case 'Boolean':
                if (typeof value === 'string') formData.object[name] = value === 'true';
                break;
        }
    }
}
