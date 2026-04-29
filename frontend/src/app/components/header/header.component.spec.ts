import { TestBed, ComponentFixture } from '@angular/core/testing';
import { HeaderComponent } from './header.component';

describe('HeaderComponent', () => {
  let component: HeaderComponent;
  let fixture: ComponentFixture<HeaderComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HeaderComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(HeaderComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should open voter portal in a new tab', () => {
    spyOn(window, 'open');
    component.openVoterPortal();
    expect(window.open).toHaveBeenCalledWith('https://voters.eci.gov.in/', '_blank');
  });
});
