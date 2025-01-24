import { LightningElement, api, wire, track } from 'lwc';

import OpportunityVersionCreationComponent from 'c/opportunityVersionCreationComponent';
import OpportunityVersionEditComponent from 'c/opportunityVersionEditComponent';

import { ShowToastEvent } from 'lightning/platformShowToastEvent';

import { subscribe, unsubscribe, MessageContext } from 'lightning/messageService';
import OpportunityVersionRefreshChannel from '@salesforce/messageChannel/OpportunityVersionRefreshChannel__c';
import OpportunityVersionLineItemRefreshChannel from '@salesforce/messageChannel/OpportunityVersionLineItemRefreshChannel__c';

import getRelatedOpportunityVersions from '@salesforce/apex/OpportunityVersionComponentController.getRelatedOpportunityVersions';
import getOpportunityVersionLineItems from '@salesforce/apex/OpportunityVersionComponentController.getOpportunityVersionLineItems';
import updateVersionStatus from '@salesforce/apex/OpportunityVersionComponentController.updateVersionStatus';
import deleteVersion from '@salesforce/apex/OpportunityVersionComponentController.deleteVersion';

export default class OpportunityVersionComponent extends LightningElement {

    @api recordId;
    @track versions = [];
    @track versionLineItems = [];
    @track selectedVersionId = '';
    @track isVersionLoading = false;
    @track isVersionLineItemsLoading = false;
    @track selectedRows = [];

    versionColumns = [
        { label: 'Name', fieldName: 'Name', cellAttributes: { alignment: 'left' } },
        { label: 'Status', fieldName: 'Status__c', cellAttributes: { alignment: 'left' } },
        { label: 'Total Price', fieldName: 'Total_Price__c', type: 'currency', cellAttributes: { alignment: 'left' } },
        { label: 'Total Hours', fieldName: 'Total_Hours__c', type: 'number', cellAttributes: { alignment: 'left' } },
        { label: 'Total Cost', fieldName: 'Total_Cost__c', type: 'currency', cellAttributes: { alignment: 'left' } },
        { label: 'Syncing', fieldName: 'Syncing__c', type: 'boolean', cellAttributes: { alignment: 'left' } },
        {
            type: 'action',
            typeAttributes: {
                rowActions: this.getRowActions.bind(this), // Bind dynamic row actions
            },
            cellAttributes: { alignment: 'left' },
        },
    ];

    versionLineItemColumns = [
        { label: 'Product Name', fieldName: 'Team_Name__c', type: 'text', cellAttributes: { alignment: 'left' } },
        { label: 'Price', fieldName: 'Price__c', type: 'currency', cellAttributes: { alignment: 'left' } },
        { label: 'Hours', fieldName: 'Hours__c', type: 'number', cellAttributes: { alignment: 'left' } },
        { label: 'Cost', fieldName: 'Cost__c', type: 'currency', cellAttributes: { alignment: 'left' } },
        { label: 'Pricing Complete', fieldName: 'Pricing_Complete__c', type: 'boolean', cellAttributes: { alignment: 'left' } },
    ];

    @wire(MessageContext) messageContext;

    connectedCallback() {
        console.log('Initializing Version Component');
        this.fetchRelatedVersions();

        // Subscribe to the Version refresh channel
        this.subscription = subscribe(this.messageContext, OpportunityVersionRefreshChannel, (message) => {
            if (message.refresh) {
                console.log('Received Version Refresh event');
                this.fetchRelatedVersions();
            }
        });

        // Subscribe to the Version Line Item refresh channel
        this.lineItemSubscription = subscribe(this.messageContext, OpportunityVersionLineItemRefreshChannel, (message) => {
            if (message.refresh) {
                console.log('Received Version Line Item Refresh event');
                this.fetchVersionLineItems();
            }
        });
    }

    disconnectedCallback() {
        console.log('Disconnecting subscriptions');
        if (this.subscription) {
            unsubscribe(this.subscription);
            this.subscription = null;
        }

        if (this.lineItemSubscription) {
            unsubscribe(this.lineItemSubscription);
            this.lineItemSubscription = null;
        }
    }

    fetchRelatedVersions() {
        console.log('Fetching related versions for Opportunity ID:', this.recordId);
        this.isVersionLoading = true;

        getRelatedOpportunityVersions({ opportunityId: this.recordId })
            .then((result) => {
                this.versions = result;
                console.log('Fetched related versions:', this.versions);

                const syncingVersion = this.versions.find((version) => version.Syncing__c);
                if (syncingVersion) {
                    this.selectedVersionId = syncingVersion.Id;
                    this.selectedRows = [this.selectedVersionId];
                    console.log('Found syncing version:', syncingVersion);
                    this.fetchVersionLineItems();
                }
            })
            .catch((error) => {
                console.error('Error fetching versions:', error);
            })
            .finally(() => {
                this.isVersionLoading = false;
                console.log('Completed fetching related versions');
            });
    }

    fetchVersionLineItems() {
        if (!this.selectedVersionId) {
            console.warn('No selectedVersionId to fetch line items.');
            return;
        }
        console.log('Fetching version line items for Version ID:', this.selectedVersionId);
        this.versionLineItems = []; // Clear existing data for UI refresh
        this.isVersionLineItemsLoading = true;

        getOpportunityVersionLineItems({ versionId: this.selectedVersionId })
            .then((result) => {
                console.log('Fetched version line items:', result);
                const tempVersionId = this.selectedVersionId;
                this.selectedVersionId = null;
                setTimeout(() => {
                    this.selectedVersionId = tempVersionId;
                    this.versionLineItems = [...result];
                    console.log('Updated version line items in UI:', this.versionLineItems);
                }, 0);
            })
            .catch((error) => {
                console.error('Error fetching version line items:', error);
            })
            .finally(() => {
                this.isVersionLineItemsLoading = false;
                console.log('Completed fetching version line items');
            });
    }

    handleVersionRowSelection(event) {
        const selectedRows = event.detail.selectedRows;
        if (selectedRows.length > 0) {
            this.selectedVersionId = selectedRows[0].Id;
            this.selectedRows = [this.selectedVersionId];
            console.log('Selected Version ID:', this.selectedVersionId);
            this.fetchVersionLineItems();
        }
    }

    handleRowAction(event) {
        const actionName = event.detail.action.name;
        const row = event.detail.row;
        console.log('Row action triggered:', actionName, 'Row:', row);

        switch (actionName) {
            case 'approve':
                this.approveVersion(row);
                break;
            case 'edit':
                this.editVersion(row);
                break;
            case 'delete':
                this.deleteVersion(row);
                break;
            default:
                console.error('Unknown action:', actionName);
        }
    }

    getRowActions(row, doneCallback) {
        const actions = [];
        if (row.Status__c === 'Draft' && !row.Syncing__c) {
            actions.push({
                label: 'Approve',name: 'approve',iconName: 'utility:check',
            },
            {
                label: 'Edit',name: 'edit',iconName: 'utility:edit',
            },
            {
                label: 'Delete',name: 'delete',iconName: 'utility:delete',
            });
        }
        if (row.Status__c === 'Obsolete' && !row.Syncing__c) {
            actions.push({
                label: 'Delete',name: 'delete',iconName: 'utility:delete',
            });
        }
        if (row.Status__c !== 'Draft' && row.Syncing__c) {
            actions.push({
                label: 'No Actions',name: 'no_actions',iconName: 'utility:ban', 
            });
        }
    
        setTimeout(() => {
            doneCallback(actions);
        }, 200); // Simulate server-side processing
    }    

    approveVersion(row) {
        console.log('Approving version:', row);
        const confirmSync = confirm('Are you sure you want to approve this version?');
        if (!confirmSync) {
            console.log('Approval cancelled by user');
            return;
        }

        this.isVersionsLoading = true;

        updateVersionStatus({ versionId: row.Id, status: 'Approved' })
            .then(() => {
                console.log('Successfully synced version:', row);
                const toastEvent = new ShowToastEvent({
                    title: 'Success',
                    message: `Version ${row.Name} has been synced successfully.`,
                    variant: 'success',
                });
                this.dispatchEvent(toastEvent);
                this.fetchRelatedVersions();
            })
            .catch((error) => {
                console.error('Error syncing version:', error);
                const toastEvent = new ShowToastEvent({
                    title: 'Error',
                    message: 'Failed to approve the version.',
                    variant: 'error',
                });
                this.dispatchEvent(toastEvent);
            })
            .finally(() => {
                this.isVersionsLoading = false;
                console.log('Approve operation completed');
            });
    }

    editVersion(row) {
        console.log('Editing version:', row);
        if (row.Syncing__c) {
            console.warn('Cannot edit a syncing version:', row);
            const toastEvent = new ShowToastEvent({
                title: 'Error',
                message: 'Cannot edit a syncing version. Please sync another version before editing this one.',
                variant: 'error',
            });
            this.dispatchEvent(toastEvent);
            return;
        }
        if (row.Status__c === 'Obsolete') {
            const toastEvent = new ShowToastEvent({
                title: 'Error',
                message: 'Cannot edit a version with status "Obsolete". ',
                variant: 'error',
            });
            this.dispatchEvent(toastEvent);
            return;
        }
        OpportunityVersionEditComponent.open({
            size: 'medium',
            description: 'Edit Version Line Items',
            versionId: row.Id,
            opportunityId: this.recordId,
        }).then((result) => {
            if (result === 'save') {
                console.log('Edit operation saved for Version:', row);
                this.fetchRelatedVersions();
            }
        });
    }

    deleteVersion(row) {
        console.log('Deleting version:', row);
        if (row.Syncing__c) {
            console.warn('Cannot delete a syncing version:', row);
            const toastEvent = new ShowToastEvent({
                title: 'Error',
                message: 'Cannot delete a syncing version. Please sync another version before deleting this one.',
                variant: 'error',
            });
            this.dispatchEvent(toastEvent);
            return;
        }

        const confirmDelete = confirm('Are you sure you want to delete this version?');
        if (!confirmDelete) {
            console.log('Delete operation cancelled by user');
            return;
        }

        deleteVersion({ versionId: row.Id })
            .then(() => {
                console.log('Successfully deleted version:', row);
                const toastEvent = new ShowToastEvent({
                    title: 'Success',
                    message: `Version ${row.Name} has been deleted successfully.`,
                    variant: 'success',
                });
                this.dispatchEvent(toastEvent);
                this.fetchRelatedVersions();
            })
            .catch((error) => {
                console.error('Error deleting version:', error);
                const toastEvent = new ShowToastEvent({
                    title: 'Error',
                    message: 'Failed to delete the version.',
                    variant: 'error',
                });
                this.dispatchEvent(toastEvent);
            });
    }  
    
    async openVersionModal() {
        console.log('Opening Version Creation Modal');
        const result = await OpportunityVersionCreationComponent.open({
            size: 'medium',
            description: 'Create a new version and associated line items',
            opportunityId: this.recordId,
        });

        if (result === 'save') {
            console.log('Version creation completed');
            this.fetchRelatedVersions();
        }
    }    

    refreshComponent() {
        console.log('Refreshing Version Component');
        this.fetchRelatedVersions();
    }
}