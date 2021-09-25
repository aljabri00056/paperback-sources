import {
    Button,
    NavigationButton,
    SourceStateManager
} from 'paperback-extensions-common'



export const getDomain = async (
    stateManager: SourceStateManager
): Promise<string> => {
    return (
        (await stateManager.retrieve('domain') as string) ?? (await stateManager.retrieve('default_domain') as string)
    )
}


export const BackupDomain = async (
    stateManager: SourceStateManager
): Promise<boolean> => {
    return (await stateManager.retrieve('backup_domain') as boolean) ?? false
}


export const domainSettings = (
    stateManager: SourceStateManager
): NavigationButton => {
    return createNavigationButton({
        id: 'domain_settings',
        value: '',
        label: 'DOMAIN Settings',
        form: createForm({
            onSubmit: (values: any) => {
                return Promise.all([
                    stateManager.store('domain', values.domain[0]),
                    stateManager.store('backup_domain', values.backup_domain)
                ]).then()
            },
            validate: () => {
                return Promise.resolve(true)
            },
            sections: () => {
                return Promise.resolve([
                    createSection({
                        id: 'domain_section',
                        rows: () => {
                            return Promise.all([
                                getDomain(stateManager),
                                BackupDomain(stateManager)
                            ]).then(async (values) => {
                                return [
                                    createSelect({
                                        id: 'domain',
                                        label: 'DOMAIN',
                                        options: ['gmanga.me', 'gmanga.org'],
                                        displayLabel: (option) => option,
                                        value: [values[0]]
                                    }),
                                    createSwitch({
                                        id: 'backup_domain',
                                        label: 'Backup DOMAIN',
                                        value: values[1]
                                    })
                                ]
                            })
                        }
                    })
                ])
            }
        })
    })
}

export const resetSettings = (stateManager: SourceStateManager): Button => {
    return createButton({
        id: 'reset',
        label: 'Reset to Default',
        value: '',
        onTap: () => {
            return Promise.all([
                stateManager.store('domain', null),
                stateManager.store('backup_domain', null)
            ])
        }
    })
}
