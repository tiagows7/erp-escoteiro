program ErpEscoteiro;

uses
  System.StartUpCopy,
  FMX.Forms,
  erpescoteiro.view.index in 'src\erpescoteiro.view.index.pas' {Form2};

{$R *.res}

begin
  Application.Initialize;
  Application.CreateForm(TForm2, Form2);
  Application.Run;
end.
